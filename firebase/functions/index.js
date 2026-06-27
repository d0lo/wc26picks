import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import logger from 'firebase-functions/logger'
import { fetchScoreboard, fetchSummary } from './lib/espn.js'
import { normalizeEvent, normalizeMatch, parseGroupLetter } from './lib/normalize.js'
import { scoreGroupPrediction, scorePick, sumGroupPoints, advancingThirdPlaceLetters, creditWildcardPicks } from './lib/scoring.js'

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

  await Promise.all(flipped.map((e) => processMatchUpdate(e.id)))
})

async function processMatchUpdate(eventId) {
  try {
    const summary = await fetchSummary(eventId)
    const match = normalizeMatch(summary)

    // Group-stage matches carry standings; knockout matches don't, so this
    // is null for knockout — onMatchComplete relies on that to skip rescoring
    // group/wildcard points once the group stage is over.
    let groupLetter = null
    if (match.groupStandings.length > 0) {
      const groupName = summary.header.competitions[0].competitors[0]?.team?.groups?.name
      groupLetter = parseGroupLetter(groupName)
    }

    await db.doc(`matches/${eventId}`).set(
      { eventId, fetchedAt: FieldValue.serverTimestamp(), groupLetter, ...match },
      { merge: true }
    )

    if (groupLetter) {
      await db
        .doc(`groups/${groupLetter}`)
        .set({ letter: groupLetter, updatedAt: FieldValue.serverTimestamp(), entries: match.groupStandings }, { merge: true })
    }
  } catch (err) {
    logger.error(`Failed to process match update for event ${eventId}`, err)
  }
}

// Fires on every matches/{eventId} write. Once a match finishes, recomputes
// that match's group score for every pick fresh from the current standings
// and overwrites scores/{uid}.breakdown — never additive, since the final
// two matches in a group kick off together and finish moments apart, firing
// this twice in quick succession for the same group.
export const onMatchComplete = onDocumentWritten('matches/{eventId}', async (event) => {
  const after = event.data?.after?.data()
  if (after?.status?.state !== 'post') return

  // Knockout matches have no groupLetter — group/wildcard standings are
  // frozen once the group stage ends, so there's nothing to rescore.
  const letter = after.groupLetter
  if (!letter) return

  const [groupsSnap, picksSnap, configSnap] = await Promise.all([
    db.collection('groups').get(),
    db.collection('picks').get(),
    db.doc('config/public').get(),
  ])

  const groupsByLetter = Object.fromEntries(groupsSnap.docs.map((d) => [d.id, d.data()?.entries ?? []]))
  const standings = groupsByLetter[letter]
  if (!standings) {
    logger.warn(`onMatchComplete: no standings yet for group ${letter} (event ${event.params.eventId})`)
    return
  }

  const scoring = configSnap.data()?.scoring ?? {}
  const advancing = advancingThirdPlaceLetters(groupsByLetter)

  await Promise.all(
    picksSnap.docs.map(async (picksDoc) => {
      const pick = picksDoc.data()
      const { points: groupPoints } = scoreGroupPrediction(pick.groups?.[letter], standings, scoring)
      const wildcardPoints = creditWildcardPicks(pick.wildcards, advancing, scoring)

      const scoreRef = db.doc(`scores/${picksDoc.id}`)
      await db.runTransaction(async (tx) => {
        const existing = (await tx.get(scoreRef)).data()?.breakdown ?? {}
        const groups = { ...existing.groups, [letter]: groupPoints }
        const total = (sumGroupPoints(groups) ?? 0) + wildcardPoints + (existing.props ?? 0)

        tx.set(
          scoreRef,
          {
            uid: picksDoc.id,
            breakdown: { ...existing, groups, wildcards: wildcardPoints },
            total,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      })
    })
  )
})

// Fires on every config/public write. Point values can be retuned live via
// the admin editor at any time, including after groups already have
// standings — onMatchComplete's single-group patch never revisits those
// already-scored groups, so a value change needs its own full rescore across
// every group, for every pick. Skips the rescore unless `scoring` itself
// changed (e.g. an unrelated picksLockAt edit shouldn't trigger this).
export const onScoringConfigWrite = onDocumentWritten('config/public', async (event) => {
  const before = event.data?.before?.data()
  const after = event.data?.after?.data()
  if (!after || JSON.stringify(after.scoring) === JSON.stringify(before?.scoring)) return

  const [groupsSnap, picksSnap] = await Promise.all([db.collection('groups').get(), db.collection('picks').get()])
  const groupsByLetter = Object.fromEntries(groupsSnap.docs.map((d) => [d.id, d.data()?.entries ?? []]))
  const scoring = after.scoring ?? {}

  await Promise.all(
    picksSnap.docs.map(async (picksDoc) => {
      const pick = picksDoc.data()
      const { groups, wildcards } = scorePick(pick, groupsByLetter, scoring)
      const groupsTotal = sumGroupPoints(groups) ?? 0

      const scoreRef = db.doc(`scores/${picksDoc.id}`)
      await db.runTransaction(async (tx) => {
        const existingProps = (await tx.get(scoreRef)).data()?.breakdown?.props ?? 0
        tx.set(
          scoreRef,
          {
            uid: picksDoc.id,
            breakdown: { groups, wildcards, props: existingProps },
            total: groupsTotal + wildcards + existingProps,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      })
    })
  )
})
