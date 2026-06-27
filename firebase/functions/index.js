import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import logger from 'firebase-functions/logger'
import { fetchScoreboard, fetchSummary } from './lib/espn.js'
import { normalizeEvent, normalizeMatch, parseGroupLetter } from './lib/normalize.js'
import { scoreGroupPrediction, advancingThirdPlaceLetters, creditWildcardPicks, scorePick } from './lib/scoring.js'
import { isGroupComplete } from './lib/tournament.js'
import { applyBreakdownPatch } from './lib/firestoreScoring.js'

initializeApp()
const db = getFirestore()

function utcDateString(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

// Decides whether this tick is worth an ESPN call. Three cases:
//   - a match is already live ("polling" state) — always fetch, the single
//     active chain's regular tick covers every match for the day at once,
//     including any other match that kicks off while this one is still live.
//   - we haven't learned today's schedule yet — fetch once to pick it up
//     (also catches a match already "in" if this is a cold start mid-day).
//   - a cached kickoff time has passed and that match isn't "post" yet —
//     fetch to see if it actually started (handles real-world kickoff delay
//     by simply checking again next minute until it flips to "in"/"post").
function shouldFetch(data, today, now) {
  if (data?.state === 'polling') return true
  if (data?.scheduleDate !== today) return true
  return (data?.kickoffs ?? []).some((k) => k.state !== 'post' && now >= new Date(k.date).getTime())
}

// Runs every minute, all day. Almost every tick is a single cheap Firestore
// read that short-circuits with no ESPN call — the goal is exactly one
// active "polling" chain covering all of today's matches at once, woken by
// the nearest kickoff time and put back to sleep the instant nothing is live.
export const espnPoller = onSchedule({ schedule: '* * * * *', timeZone: 'UTC' }, async () => {
  const scoreboardRef = db.doc('liveData/scoreboard')
  const today = utcDateString(new Date())
  const data = (await scoreboardRef.get()).data()

  if (!shouldFetch(data, today, Date.now())) return

  const raw = await fetchScoreboard()
  const events = (raw.events || []).map(normalizeEvent)
  const state = events.some((e) => e.status.state === 'in') ? 'polling' : 'idle'

  await scoreboardRef.set(
    {
      today,
      scheduleDate: today,
      events,
      hasMatches: events.length > 0,
      kickoffs: events.map((e) => ({ eventId: e.id, date: e.date, state: e.status.state })),
      state,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
})

// Fires on every liveData/scoreboard write. For each match that just
// flipped into "in" or "post", fetches the full ESPN summary and writes the
// match detail + that match's group standings.
export const onScoreboardWrite = onDocumentWritten('liveData/scoreboard', async (event) => {
  const before = event.data?.before?.data()
  const after = event.data?.after?.data()
  if (!after) return

  const beforeById = new Map((before?.events || []).map((e) => [e.id, e]))
  const flipped = (after.events || []).filter((e) => {
    const state = e.status?.state
    if (state !== 'in' && state !== 'post') return false
    const prev = beforeById.get(e.id)
    return !prev || prev.status?.state !== state
  })

  // e.group (e.g. "Group A") was already parsed from /scoreboard's
  // altGameNote by normalizeEvent — reuse that instead of re-deriving the
  // letter from a second, independent ESPN field inside processMatchUpdate.
  // Group assignment is fixed before the tournament starts, so this
  // earlier-computed value is exactly as correct as one re-fetched later.
  await Promise.all(flipped.map((e) => processMatchUpdate(e.id, e.group ? parseGroupLetter(e.group) : null)))
})

async function processMatchUpdate(eventId, groupLetter) {
  try {
    const summary = await fetchSummary(eventId)
    const match = normalizeMatch(summary)
    const hasStandings = groupLetter && match.groupStandings.length > 0

    // Independent writes (no read-after-write dependency between them) — a
    // batch makes them atomic without paying for a transaction.
    const batch = db.batch()
    batch.set(db.doc(`matches/${eventId}`), { eventId, fetchedAt: FieldValue.serverTimestamp(), groupLetter, ...match }, { merge: true })
    if (hasStandings) {
      batch.set(db.doc(`groups/${groupLetter}`), { letter: groupLetter, updatedAt: FieldValue.serverTimestamp(), entries: match.groupStandings }, { merge: true })
    }
    await batch.commit()

    if (groupLetter && match.status.state === 'post') {
      await markGroupCompleteIfDecided(groupLetter)
    }
  } catch (err) {
    logger.error(`Failed to process match update for event ${eventId}`, err)
  }
}

// Marks groups/{letter}.complete once every one of that group's 6
// round-robin matches has finished, per our own match-status records — not
// ESPN's secondary gamesPlayed standings stat, which is one inferential step
// removed and could lag behind the real status flip we already track. Only
// writes on the false→true transition: if this somehow re-runs after
// complete is already true, it finds nothing changed and skips the write, so
// it can't loop.
async function markGroupCompleteIfDecided(letter) {
  const groupRef = db.doc(`groups/${letter}`)
  const [groupDoc, matchesSnap] = await Promise.all([groupRef.get(), db.collection('matches').where('groupLetter', '==', letter).get()])
  if (groupDoc.data()?.complete) return
  if (!isGroupComplete(matchesSnap.docs.map((d) => d.data()))) return
  await groupRef.set({ complete: true }, { merge: true })
}

// Fires on every matches/{eventId} write. Once a match finishes, recomputes
// that match's group score for every pick fresh from the current standings
// and overwrites scores/{uid}.breakdown.groups[letter] — never additive,
// since the final two matches in a group kick off together and finish
// moments apart, firing this twice in quick succession for the same group.
// Sole owner of breakdown.groups — wildcards are onGroupsWrite's job below,
// since they depend on all 12 groups at once, not just the one that changed.
export const onMatchComplete = onDocumentWritten('matches/{eventId}', async (event) => {
  const after = event.data?.after?.data()
  if (after?.status?.state !== 'post') return

  // Knockout matches have no groupLetter — group standings are frozen once
  // the group stage ends, so there's nothing to rescore.
  const letter = after.groupLetter
  if (!letter) return

  const [groupsSnap, picksSnap, configSnap] = await Promise.all([db.collection('groups').get(), db.collection('picks').get(), db.doc('config/public').get()])

  const groupsByLetter = Object.fromEntries(groupsSnap.docs.map((d) => [d.id, d.data()?.entries ?? []]))
  const standings = groupsByLetter[letter]
  if (!standings) {
    logger.warn(`onMatchComplete: no standings yet for group ${letter} (event ${event.params.eventId})`)
    return
  }

  const scoring = configSnap.data()?.scoring ?? {}

  await Promise.all(
    picksSnap.docs.map((picksDoc) => {
      const { points: groupPoints } = scoreGroupPrediction(picksDoc.data().groups?.[letter], standings, scoring)
      return applyBreakdownPatch(db, picksDoc.id, (existing) => ({ ...existing, groups: { ...existing.groups, [letter]: groupPoints } }))
    })
  )
})

// Fires on every groups/{letter} write — i.e. after every group-stage match
// completes. Sole owner of breakdown.wildcards: recomputes the "best 8
// third-place teams" ranking fresh from all 12 groups every time (so a
// result swing in one group can still bump a different group's third-place
// team in or out of the advancing set), but only rescores every pick's
// wildcards when that ranking actually changed — if it didn't move, every
// pick's wildcard score is provably unchanged, so the rescore is skipped.
// This removes the old dual-writer race architecturally: one field
// (breakdown.wildcards), one writer (this trigger), recomputed fresh from
// the latest groups data on every call rather than from a stale snapshot.
export const onGroupsWrite = onDocumentWritten('groups/{letter}', async () => {
  const [groupsSnap, picksSnap, configSnap] = await Promise.all([db.collection('groups').get(), db.collection('picks').get(), db.doc('config/public').get()])

  const groupsByLetter = Object.fromEntries(groupsSnap.docs.map((d) => [d.id, d.data()?.entries ?? []]))
  const advancing = advancingThirdPlaceLetters(groupsByLetter)
  const nextLetters = [...advancing].sort()

  const wildcardsRef = db.doc('liveData/wildcards')
  const previousLetters = (await wildcardsRef.get()).data()?.advancingLetters ?? []
  if (arraysEqual(previousLetters, nextLetters)) return

  await wildcardsRef.set({ advancingLetters: nextLetters, updatedAt: FieldValue.serverTimestamp() }, { merge: true })

  const scoring = configSnap.data()?.scoring ?? {}
  await Promise.all(
    picksSnap.docs.map((picksDoc) => {
      const wildcardPoints = creditWildcardPicks(picksDoc.data().wildcards, advancing, scoring)
      return applyBreakdownPatch(db, picksDoc.id, (existing) => ({ ...existing, wildcards: wildcardPoints }))
    })
  )
})

function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  return aKeys.length === bKeys.length && aKeys.every((k) => deepEqual(a[k], b[k]))
}

// Fires on every config/public write. Point values can be retuned live via
// the admin editor at any time, including after groups already have
// standings — onMatchComplete's single-group patch never revisits those
// already-scored groups, so a value change needs its own full rescore across
// every group, for every pick. Skips the rescore unless `scoring` itself
// changed (e.g. an unrelated picksLockAt edit shouldn't trigger this) — a
// structural deep-equal, not JSON.stringify, since Firestore doesn't
// guarantee map key order is preserved across writes/reads.
export const onScoringConfigWrite = onDocumentWritten('config/public', async (event) => {
  const before = event.data?.before?.data()
  const after = event.data?.after?.data()
  if (!after || deepEqual(after.scoring, before?.scoring)) return

  const [groupsSnap, picksSnap, wildcardsSnap] = await Promise.all([db.collection('groups').get(), db.collection('picks').get(), db.doc('liveData/wildcards').get()])
  const groupsByLetter = Object.fromEntries(groupsSnap.docs.map((d) => [d.id, d.data()?.entries ?? []]))
  // Reuses onGroupsWrite's already-computed advancing set instead of
  // re-ranking all 12 groups again here — one computation owner for the
  // ranking across the whole engine.
  const advancing = new Set(wildcardsSnap.data()?.advancingLetters ?? [])
  const scoring = after.scoring ?? {}

  await Promise.all(
    picksSnap.docs.map((picksDoc) => {
      const pick = picksDoc.data()
      const { groups, wildcards } = scorePick(pick, groupsByLetter, advancing, scoring)
      return applyBreakdownPatch(db, picksDoc.id, (existing) => ({ groups, wildcards, props: existing.props ?? 0 }))
    })
  )
})
