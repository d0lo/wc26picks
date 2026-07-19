import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import logger from 'firebase-functions/logger'
import { fetchScoreboard, fetchScoreboardForDate, fetchSummary } from './lib/espn.js'
import { normalizeEvent, normalizeMatch, parseGroupLetter } from './lib/normalize.js'
import {
  scoreGroupPrediction,
  advancingThirdPlaceLetters,
  creditWildcardPicks,
  scorePick,
  determineKnockoutWinner,
  scoreKnockoutSlot,
  scoreKnockout,
  scorePropPicks,
} from './lib/scoring.js'
import { buildPlayerIndex, computePropResults } from './lib/props.js'
import { ROUNDS } from './lib/bracket.js'
import { isGroupComplete, isGroupStageComplete } from './lib/tournament.js'
import { applyBreakdownPatch } from './lib/firestoreScoring.js'
import {
  utcDateString,
  todaysKickoffs,
  shouldFetch,
  mergeFetchedKickoffs,
  isWithinTournament,
  isGroupStageOver,
  TOURNAMENT_START,
  TOURNAMENT_END,
} from './lib/poller.js'

initializeApp()
const db = getFirestore()

// Runs every minute, all day. Almost every tick is a couple of cheap Firestore
// reads that short-circuit with no ESPN call — the goal is exactly one active
// "polling" chain covering all of today's matches at once, woken by each
// kickoff time and put back to sleep the instant nothing is live. Today's
// kickoff list comes from liveData/schedule (the full fixture index) so the
// poller wakes for every scheduled game, including ones that kick off after an
// earlier batch has already finished (e.g. R32 right after the group finale).
export const espnPoller = onSchedule({ schedule: '* * * * *', timeZone: 'UTC' }, async () => {
  const now = Date.now()
  // Off-season short-circuit: before any Firestore read. Outside the tournament
  // window there are no matches to poll, so every tick returns here for $0/day.
  if (!isWithinTournament(now)) return

  const scoreboardRef = db.doc('liveData/scoreboard')
  const today = utcDateString(new Date(now))
  const data = (await scoreboardRef.get()).data()

  // The scoreboard doc already caches today's kickoff ledger once the first tick
  // of the day has seeded it from liveData/schedule (the end-of-tick write sets
  // scheduleDate + kickoffs together, and the first tick of any new day always
  // fetches). So only re-read the schedule doc when the cache is for a prior
  // day — halving this every-minute function's steady-state reads (2→1) on all
  // but the first tick of each day. A same-day schedule change is picked up on
  // the next day's reseed or when the match appears in a live fetch (the same
  // mergeFetchedKickoffs backstop that already self-heals a missing fixture).
  let kickoffs
  if (data?.scheduleDate === today) {
    kickoffs = data.kickoffs ?? []
  } else {
    const schedule = (await db.doc('liveData/schedule').get()).data()
    kickoffs = todaysKickoffs(schedule?.events, data, today)
  }

  if (!shouldFetch(data, today, now, kickoffs)) return

  const raw = await fetchScoreboard()
  const events = (raw.events || []).map(normalizeEvent)
  // Fold fetched events into the schedule-derived ledger (and keep games ESPN
  // has since dropped, with their last-known state) so the poller self-heals
  // even if the schedule doc never listed a match.
  const mergedKickoffs = mergeFetchedKickoffs(kickoffs, events)
  const state = events.some((e) => e.status.state === 'in') ? 'polling' : 'idle'

  await scoreboardRef.set(
    {
      today,
      scheduleDate: today,
      events,
      hasMatches: events.length > 0,
      kickoffs: mergedKickoffs,
      state,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
})

// Full-tournament fixture index for the stadium schedule's date selector.
// Runs once a day: walks every day of the tournament, fetches that day's
// scoreboard, and writes one liveData/schedule doc of all fixtures (skeleton
// only — id/date/teams/venue/round/group/state, no live scores). Live scores
// and completed-match detail stay where they already live (liveData/scoreboard
// for today's in-progress games, matches/{eventId} for finished ones); this
// function never re-fetches a game's detail and does no per-match polling.
function* scheduleDates(startISO, endISO) {
  const day = new Date(`${startISO}T00:00:00Z`)
  const end = new Date(`${endISO}T00:00:00Z`)
  while (day <= end) {
    yield utcDateString(day)
    day.setUTCDate(day.getUTCDate() + 1)
  }
}

export const scheduleSync = onSchedule({ schedule: '0 7 * * *', timeZone: 'UTC' }, async () => {
  // Off-season short-circuit: the fixture list is static once the tournament is
  // over, so stop the daily ~39-day ESPN walk (and its write) outside the window.
  if (!isWithinTournament(Date.now())) return

  const byId = new Map()
  for (const ymd of scheduleDates(TOURNAMENT_START, TOURNAMENT_END)) {
    let raw
    try {
      raw = await fetchScoreboardForDate(ymd)
    } catch (err) {
      logger.warn(`schedule fetch failed for ${ymd}: ${err.message}`)
      continue
    }
    for (const ev of raw.events || []) byId.set(String(ev.id), normalizeEvent(ev))
  }
  const events = [...byId.values()].sort((a, b) => new Date(a.date) - new Date(b.date))
  await db.doc('liveData/schedule').set({
    updatedAt: FieldValue.serverTimestamp(),
    count: events.length,
    events,
  })
  logger.info(`schedule synced: ${events.length} fixtures`)
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
  await Promise.all(flipped.map((e) => processMatchUpdate(e.id, e.group ? parseGroupLetter(e.group) : null, e.round, e.slot)))
})

async function processMatchUpdate(eventId, groupLetter, round, slot) {
  try {
    const summary = await fetchSummary(eventId)
    const match = normalizeMatch(summary)
    const hasStandings = groupLetter && match.groupStandings.length > 0

    // Independent writes (no read-after-write dependency between them) — a
    // batch makes them atomic without paying for a transaction.
    const batch = db.batch()
    batch.set(
      db.doc(`matches/${eventId}`),
      { eventId, fetchedAt: FieldValue.serverTimestamp(), groupLetter, round: round ?? null, slot: slot ?? null, ...match },
      { merge: true }
    )
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

  // Belt-and-braces: no group match completes after the group stage is over, so
  // this normally wouldn't fire post-group-stage anyway — but a late re-write of
  // an old group match doc shouldn't pay for a full picks/groups/config read to
  // recompute a frozen score. (Deliberate point-value retunes still rescore
  // frozen groups via onScoringConfigWrite, which is intentionally not gated.)
  if (isGroupStageOver(Date.now())) return

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

// Fires on every matches/{eventId} write. Sole owner of breakdown.knockout —
// mutually exclusive with onMatchComplete above: a match doc has either
// groupLetter (group stage) or round/slot (knockout), never both, so the two
// triggers never write the same field for the same event.
export const onKnockoutMatchComplete = onDocumentWritten('matches/{eventId}', async (event) => {
  const after = event.data?.after?.data()
  if (after?.status?.state !== 'post') return

  const round = after.round
  const slot = after.slot
  // Only the pickable rounds are scored; the 3rd-place match (round 'third')
  // is never picked, so it gets no breakdown entry.
  if (!round || !slot || !ROUNDS.includes(round)) return

  const winnerTeamId = determineKnockoutWinner(after.competitors)
  if (!winnerTeamId) {
    logger.warn(`onKnockoutMatchComplete: no winner determined for event ${event.params.eventId}`)
    return
  }

  const [picksSnap, configSnap] = await Promise.all([db.collection('picks').get(), db.doc('config/public').get()])
  const scoring = configSnap.data()?.scoring ?? {}
  const slotIndex = String(slot - 1)

  await Promise.all(
    picksSnap.docs.map((picksDoc) => {
      const pickedTeamId = picksDoc.data().knockout?.[round]?.[slot - 1]
      const points = scoreKnockoutSlot(pickedTeamId, winnerTeamId, round, scoring)
      return applyBreakdownPatch(db, picksDoc.id, (existing) => ({
        ...existing,
        knockout: { ...existing.knockout, [round]: { ...existing.knockout?.[round], [slotIndex]: points } },
      }))
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
  // The advancing-thirds ranking is finalized when the group stage ends and is
  // frozen thereafter; no groups/{letter} write occurs during the knockout
  // stage, so this normally won't fire then, but gate before the reads anyway.
  // (A point-value retune still rescores wildcards via onScoringConfigWrite.)
  if (isGroupStageOver(Date.now())) return

  const wildcardsRef = db.doc('liveData/wildcards')
  const [groupsSnap, previousSnap] = await Promise.all([db.collection('groups').get(), wildcardsRef.get()])

  const groupsByLetter = Object.fromEntries(groupsSnap.docs.map((d) => [d.id, d.data()?.entries ?? []]))
  const advancing = advancingThirdPlaceLetters(groupsByLetter)
  const nextLetters = [...advancing].sort()

  // The team currently sitting 3rd in each advancing group. A wildcard only
  // scores when the user's predicted 3rd-place team matches this team, so a
  // result swing that changes who holds an advancing 3rd spot must rescore
  // even when the *set* of advancing letters is unchanged — comparing letters
  // alone would skip that case and leave a stale wildcard score.
  const nextThirds = Object.fromEntries(nextLetters.map((l) => [l, groupsByLetter[l]?.[2]?.team?.id ?? null]))

  const previous = previousSnap.data() ?? {}
  if (arraysEqual(previous.advancingLetters ?? [], nextLetters) && deepEqual(previous.advancingThirds ?? {}, nextThirds)) return

  await wildcardsRef.set({ advancingLetters: nextLetters, advancingThirds: nextThirds, updatedAt: FieldValue.serverTimestamp() }, { merge: true })

  const [picksSnap, configSnap] = await Promise.all([db.collection('picks').get(), db.doc('config/public').get()])
  const scoring = configSnap.data()?.scoring ?? {}
  await Promise.all(
    picksSnap.docs.map((picksDoc) => {
      const wildcardPoints = creditWildcardPicks(picksDoc.data(), groupsByLetter, advancing, scoring)
      return applyBreakdownPatch(db, picksDoc.id, (existing) => ({ ...existing, wildcards: wildcardPoints }))
    })
  )
})

function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

// Recomputes the canonical prop winners (liveData/propResults) fresh from
// source data: the catalog + manual overrides + every match doc, with player
// display names mapped to roster UUIDs via the seeded players/ collection.
// Skips the write when nothing changed, so re-fires converge instead of
// cascading into onPropResultsWrite rescores. Called from more than one
// trigger (match completion, manual-override write, config retune) — safe
// because every call recomputes from the same sources idempotently; there is
// no partial/additive state for two invocations to race on. Returns the
// freshly-computed results map so a caller that rescores right after (e.g.
// onScoringConfigWrite) can use it directly instead of re-reading the doc.
async function refreshPropResults() {
  const [matchesSnap, playersSnap, groupsSnap, configSnap, overridesSnap, currentSnap] = await Promise.all([
    db.collection('matches').get(),
    db.collection('players').get(),
    db.collection('groups').get(),
    db.doc('config/public').get(),
    db.doc('config/propResults').get(),
    db.doc('liveData/propResults').get(),
  ])
  const catalog = configSnap.data()?.scoring?.props ?? []
  if (playersSnap.empty) logger.warn('refreshPropResults: players/ collection is empty — player props cannot be auto-matched')

  const results = computePropResults({
    catalog,
    // Doc id rides along as the eventId fallback (same shape the client's
    // matchesQueryOptions produces for propLeaders.js).
    matches: matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    playerIndex: buildPlayerIndex(playersSnap.docs.map((d) => d.data())),
    groupsComplete: isGroupStageComplete(groupsSnap.docs.map((d) => d.data())),
    overrides: overridesSnap.data()?.overrides,
  })

  if (!deepEqual(currentSnap.data()?.results ?? {}, results)) {
    // Full set (no merge) so a prop whose entry disappeared — override
    // cleared, prop archived — actually drops out instead of lingering.
    await db.doc('liveData/propResults').set({ results, updatedAt: FieldValue.serverTimestamp() })
  }
  return results
}

// Fires on every matches/{eventId} write. Once a match finishes (group or
// knockout — goals in either stage move goldenBoot & co.), recomputes the
// prop winners. Gated first on the prop-relevant fields actually changing —
// a zero-read check on the event payload — so idempotent re-writes of an
// already-finished match (backfill scripts, re-fetched identical summaries)
// don't each pay refreshPropResults' full matches+players collection read
// just to conclude nothing moved.
export const onMatchCompleteProps = onDocumentWritten('matches/{eventId}', async (event) => {
  const before = event.data?.before?.data()
  const after = event.data?.after?.data()
  if (after?.status?.state !== 'post') return
  if (
    before?.status?.state === 'post' &&
    deepEqual(before.scoringPlays, after.scoringPlays) &&
    deepEqual(before.rosters, after.rosters) &&
    deepEqual(before.teamStats, after.teamStats) &&
    deepEqual(before.competitors, after.competitors)
  ) return
  await refreshPropResults()
})

// Fires when an admin saves manual prop winners (config/propResults, written
// by the AdminView "Prop Winners" section — the only config doc a client can
// write besides config/public, per the isAdmin rule). Manual entries take
// precedence over auto-computed winners inside computePropResults.
export const onPropOverridesWrite = onDocumentWritten('config/propResults', async () => {
  await refreshPropResults()
})

// Fires on every liveData/propResults write. Sole owner of breakdown.props:
// rescores every pick's prop total against the new winners. Gated on the
// results actually changing so an updatedAt-only touch doesn't pay for a
// full picks rescore.
export const onPropResultsWrite = onDocumentWritten('liveData/propResults', async (event) => {
  const before = event.data?.before?.data()
  const after = event.data?.after?.data()
  if (!after || deepEqual(before?.results ?? {}, after.results ?? {})) return

  const [picksSnap, configSnap] = await Promise.all([db.collection('picks').get(), db.doc('config/public').get()])
  const catalog = configSnap.data()?.scoring?.props ?? []
  await Promise.all(
    picksSnap.docs.map((picksDoc) => {
      const points = scorePropPicks(picksDoc.data().props, catalog, after.results)
      return applyBreakdownPatch(db, picksDoc.id, (existing) => ({ ...existing, props: points }))
    })
  )
})

// Winners of every finished knockout match, shaped { round: { slotIdx: winnerId } }
// for scoreKnockout. Shared by the config-change and pick-change full rescores,
// both of which re-derive a pick's whole knockout breakdown from scratch.
function collectKnockoutWinners(matchesDocs) {
  const koWinners = {}
  for (const d of matchesDocs) {
    const m = d.data()
    if (m.round && m.slot && ROUNDS.includes(m.round) && m.status?.state === 'post') {
      const w = determineKnockoutWinner(m.competitors)
      if (w) (koWinners[m.round] ??= {})[String(m.slot - 1)] = w
    }
  }
  return koWinners
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

  // Catalog edits can change the winners themselves (flipping a prop's
  // `manual` flag drops its auto winners; archiving drops its entry), so the
  // canonical results are refreshed first and the freshly-computed map is
  // used directly below. If the refresh found changes it also wrote
  // liveData/propResults, and the resulting onPropResultsWrite rescore is
  // redundant with the one below — but both are idempotent full overwrites,
  // so that costs a duplicate pass, not a wrong score.
  const propResults = await refreshPropResults()

  const [groupsSnap, picksSnap, wildcardsSnap, matchesSnap] = await Promise.all([
    db.collection('groups').get(),
    db.collection('picks').get(),
    db.doc('liveData/wildcards').get(),
    db.collection('matches').get(),
  ])
  const groupsByLetter = Object.fromEntries(groupsSnap.docs.map((d) => [d.id, d.data()?.entries ?? []]))
  // Reuses onGroupsWrite's already-computed advancing set instead of
  // re-ranking all 12 groups again here — one computation owner for the
  // ranking across the whole engine.
  const advancing = new Set(wildcardsSnap.data()?.advancingLetters ?? [])
  const scoring = after.scoring ?? {}

  // Winners of every finished knockout match, so a knockout point-value change
  // rescores the bracket too (not just groups/wildcards).
  const koWinners = collectKnockoutWinners(matchesSnap.docs)

  await Promise.all(
    picksSnap.docs.map((picksDoc) => {
      const pick = picksDoc.data()
      const { groups, wildcards } = scorePick(pick, groupsByLetter, advancing, scoring)
      const knockout = scoreKnockout(pick.knockout, koWinners, scoring)
      const props = scorePropPicks(pick.props, scoring.props, propResults)
      return applyBreakdownPatch(db, picksDoc.id, () => ({ groups, wildcards, props, knockout }))
    })
  )
})

// Fires on every picks/{uid} write. A user editing their own picks — group
// order, wildcard set, prop answers, or knockout bracket — must have their score recomputed
// right away. Every other trigger above only rescores in response to *results*
// (a match finishing, standings shifting, point values being retuned); none of
// them react to the picks themselves changing. Without this, a bracket edited
// after its matches had already finished would keep the score it earned under
// the *old* picks indefinitely. Recomputes the same full breakdown a config
// change does (scorePick + scoreKnockout) — just scoped to this one pick rather
// than all of them. Reads results/config and writes only scores/{uid}, so it
// can never re-trigger itself.
export const onPicksWrite = onDocumentWritten('picks/{uid}', async (event) => {
  const before = event.data?.before?.data()
  const after = event.data?.after?.data()
  if (!after) return // pick deleted — leave the existing score doc untouched

  // Only the scoring-relevant fields matter; a touch to an unrelated field
  // (e.g. submittedAt) shouldn't force a full rescore.
  if (
    before &&
    deepEqual(after.groups, before.groups) &&
    deepEqual(after.wildcards, before.wildcards) &&
    deepEqual(after.knockout, before.knockout) &&
    deepEqual(after.props, before.props)
  ) return

  const [groupsSnap, wildcardsSnap, matchesSnap, configSnap, propResultsSnap] = await Promise.all([
    db.collection('groups').get(),
    db.doc('liveData/wildcards').get(),
    db.collection('matches').get(),
    db.doc('config/public').get(),
    db.doc('liveData/propResults').get(),
  ])
  const groupsByLetter = Object.fromEntries(groupsSnap.docs.map((d) => [d.id, d.data()?.entries ?? []]))
  const advancing = new Set(wildcardsSnap.data()?.advancingLetters ?? [])
  const scoring = configSnap.data()?.scoring ?? {}
  const koWinners = collectKnockoutWinners(matchesSnap.docs)

  const { groups, wildcards } = scorePick(after, groupsByLetter, advancing, scoring)
  const knockout = scoreKnockout(after.knockout, koWinners, scoring)
  const props = scorePropPicks(after.props, scoring.props, propResultsSnap.data()?.results ?? {})
  await applyBreakdownPatch(db, event.params.uid, () => ({ groups, wildcards, props, knockout }))
})
