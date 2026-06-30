/**
 * backfill-match-player-stats.mjs — Idempotent repair: re-fetches the ESPN
 * summary for any matches/{eventId} doc that predates the per-player roster
 * stats schema and rewrites it through the current normalizeMatch, so the
 * stats-derived prop leaderboards (Most Assists, Golden Glove) stop reflecting
 * only post-deploy matches.
 *
 * Why this is needed: the per-player `rosters[].players[].stats` map
 * (goalAssists, saves, goalsConceded, totalGoals, yellowCards, …) — plus the
 * card/substitution events and goal/assist coordinates — were added to
 * normalizeMatch in commit bbd1d5f ("capture richer match data; add Most
 * Assists prop"). processMatchUpdate only re-fetches a match on its pre→in→post
 * state flips, so every match that had already finished before that deploy
 * (the entire group stage) is frozen with rosters that carry NO `stats` field.
 *
 * app/src/lib/propLeaders.js derives:
 *   - Most Assists  from rosters[].players[].stats.goalAssists
 *   - Golden Glove  from rosters[].players[].stats.saves / goalsConceded
 * so on those un-backfilled docs both props silently contribute zero, leaving
 * the leaderboards looking like they only count knockout games. (Golden Boot,
 * Most Goals and Most Yellow Cards read scoringPlays / teamStats, which have
 * existed since Feature 1, so they were unaffected.)
 *
 * Going forward there's nothing to fix — any match that finishes after the
 * deploy is normalized by the current code and carries stats. This is the
 * one-time repair for the docs written before it.
 *
 * Writes with { merge: true }, mirroring processMatchUpdate, so groupLetter /
 * round / slot (not part of normalizeMatch's output) are preserved. Detects
 * which docs need the repair by the absent stats field, so re-running it after
 * everything is backfilled is a no-op that makes zero ESPN calls.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/backfill-match-player-stats.mjs [eventId...]
 *
 * With no eventId args, scans every matches/{eventId} doc and refreshes the
 * ones missing per-player stats. Pass explicit eventIds to force-refresh
 * specific matches regardless of their current shape.
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { fetchSummary } from '../firebase/functions/lib/espn.js'
import { normalizeMatch } from '../firebase/functions/lib/normalize.js'

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks',
  })
}

const db = getFirestore()

// A doc predates the stats schema when it has roster players but none of them
// carry a `stats` map. (A genuinely statless match — e.g. one fetched before
// kickoff — has no roster players either, so it's correctly left alone.)
function missingPlayerStats(data) {
  const rosters = data.rosters ?? []
  const players = rosters.flatMap((side) => side.players ?? [])
  if (players.length === 0) return false
  return players.every((p) => p.stats === undefined)
}

const explicitIds = process.argv.slice(2)
let targets
if (explicitIds.length > 0) {
  const snaps = await Promise.all(explicitIds.map((id) => db.doc(`matches/${id}`).get()))
  targets = snaps.filter((s) => s.exists).map((s) => ({ id: s.id, groupLetter: s.data().groupLetter ?? null }))
} else {
  const snap = await db.collection('matches').get()
  targets = snap.docs
    .filter((d) => missingPlayerStats(d.data()))
    .map((d) => ({ id: d.id, groupLetter: d.data().groupLetter ?? null }))
}

console.log(`Backfilling ${targets.length} match(es): ${targets.map((t) => t.id).join(', ') || '(none)'}`)

let fixed = 0
for (const { id: eventId, groupLetter } of targets) {
  try {
    const summary = await fetchSummary(eventId)
    const match = normalizeMatch(summary)
    const hasStandings = groupLetter && match.groupStandings.length > 0

    const batch = db.batch()
    batch.set(
      db.doc(`matches/${eventId}`),
      { eventId, fetchedAt: FieldValue.serverTimestamp(), groupLetter, ...match },
      { merge: true }
    )
    if (hasStandings) {
      batch.set(
        db.doc(`groups/${groupLetter}`),
        { letter: groupLetter, updatedAt: FieldValue.serverTimestamp(), entries: match.groupStandings },
        { merge: true }
      )
    }
    await batch.commit()

    const players = (match.rosters ?? []).flatMap((side) => side.players ?? [])
    const withStats = players.filter((p) => p.stats && Object.keys(p.stats).length > 0).length
    console.log(`  ✓ ${eventId}: ${withStats}/${players.length} players now carry stats`)
    fixed++
  } catch (err) {
    console.warn(`  ! ${eventId}: backfill failed — ${err.message}`)
  }
}

console.log(`done — ${fixed} match(es) backfilled`)
process.exit(0)
