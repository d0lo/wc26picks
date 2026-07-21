/**
 * backfill-match-group-letters.mjs — One-time repair for matches/{eventId}
 * docs written before onScoreboardWrite started passing through the
 * already-parsed `groupLetter` (from /scoreboard's altGameNote, the same
 * value normalizeEvent computes) instead of re-deriving it from a second,
 * less reliable ESPN field inside processMatchUpdate.
 *
 * For any matches/{eventId} doc missing groupLetter, re-fetches the ESPN
 * summary and re-derives it with the same field-priority normalize.js uses
 * (altGameNote first), then recomputes groups/{letter}.complete for every
 * group from the now-complete matches data.
 *
 * Idempotent: a match that already has groupLetter is left untouched, and a
 * group already marked complete is never rewritten — safe no-op if nothing
 * needs backfilling.
 *
 * Run once after this PR deploys, only if production already has match data
 * predating groupLetter.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/backfill-match-group-letters.mjs
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { fetchSummary } from '../firebase/functions/lib/espn.js'
import { parseGroupLetter, knockoutRoundSlot } from '../firebase/functions/lib/normalize.js'
import { isGroupComplete } from '../firebase/functions/lib/tournament.js'
import { TEAM_ID, GROUP_TEAMS } from '../app/src/data.js'

// Primary derivation: a group-stage match's two competitors always belong to
// the same group, and group membership is fixed and committed to source
// (GROUP_TEAMS/TEAM_ID). This needs no network and — unlike ESPN's
// altGameNote, which ESPN stops returning for long-finished events — cannot
// go stale. Requires BOTH teams to map to the same group, so a knockout
// rematch of same-group teams can't be mislabeled (knockout docs are skipped
// by their `round` field anyway).
const GROUP_BY_TEAM_ID = {}
for (const [letter, names] of Object.entries(GROUP_TEAMS)) {
  for (const name of names) {
    // A GROUP_TEAMS/TEAM_ID name drift would otherwise register the letter
    // under the key "undefined", which a doc with unresolvable competitors
    // could then confidently (and wrongly) match.
    if (!TEAM_ID[name]) throw new Error(`GROUP_TEAMS name "${name}" has no TEAM_ID entry`)
    GROUP_BY_TEAM_ID[TEAM_ID[name]] = letter
  }
}

function letterFromCompetitors(match) {
  const ids = (match.competitors ?? []).map((c) => c.teamId)
  if (ids.length !== 2) return null
  const [a, b] = ids.map((id) => GROUP_BY_TEAM_ID[id] ?? null)
  return a && a === b ? a : null
}

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks',
  })
}

const db = getFirestore()
const BATCH_LIMIT = 400

// Old derivation this backfill replaces, kept only as a last-resort fallback
// for matches where ESPN no longer surfaces altGameNote for a finished event.
function legacyGroupLetter(summary) {
  const name = summary?.header?.competitions?.[0]?.competitors?.[0]?.team?.groups?.name
  return parseGroupLetter(name) ?? (name && /^[A-L]$/i.test(name) ? name.toUpperCase() : null)
}

const matchesSnap = await db.collection('matches').get()
// Knockout docs legitimately have no groupLetter — identified by their
// `round` field OR by their event id appearing in the knockout slot map
// (processMatchUpdate stores round: null when an event id is missing from
// EVENT_SLOT_MAP, and a knockout rematch of two same-group teams would
// otherwise satisfy the team-membership derivation and be mislabeled as a
// group match).
const missing = matchesSnap.docs.filter((d) => !d.data().groupLetter && !d.data().round && !knockoutRoundSlot(d.id))

let migrated = 0, unresolved = 0
let batch = db.batch(); let batchCount = 0; const batches = []

for (const doc of missing) {
  const eventId = doc.id
  let letter = letterFromCompetitors(doc.data())
  if (!letter) {
    // Fallback only — ESPN stops returning altGameNote for long-finished
    // events, so this path mostly exists for docs whose competitors weren't
    // resolvable to our team UUIDs.
    try {
      const summary = await fetchSummary(eventId)
      const altNote = summary?.header?.competitions?.[0]?.altGameNote
      letter = parseGroupLetter(altNote) ?? legacyGroupLetter(summary)
    } catch (err) {
      console.warn(`  ! ${eventId}: summary fetch failed — ${err.message}`)
    }
  }

  if (!letter) {
    console.warn(`  ! ${eventId}: could not resolve a group letter — skipping`)
    unresolved++
    continue
  }

  batch.set(db.collection('matches').doc(eventId), { groupLetter: letter }, { merge: true })
  migrated++
  if (++batchCount % BATCH_LIMIT === 0) { batches.push(batch); batch = db.batch() }
}
batches.push(batch)
for (const b of batches) await b.commit()

console.log(`✓ backfilled groupLetter on ${migrated} match(es), ${missing.length - migrated} skipped (no resolvable letter), ${unresolved} unresolved`)

// Recompute groups/{letter}.complete from the now-complete matches data.
const refreshedSnap = await db.collection('matches').get()
const matchesByLetter = new Map()
for (const doc of refreshedSnap.docs) {
  const letter = doc.data().groupLetter
  if (!letter) continue
  if (!matchesByLetter.has(letter)) matchesByLetter.set(letter, [])
  matchesByLetter.get(letter).push(doc.data())
}

let completed = 0
for (const [letter, matchDocs] of matchesByLetter) {
  if (!isGroupComplete(matchDocs)) continue
  const groupRef = db.doc(`groups/${letter}`)
  const groupDoc = await groupRef.get()
  if (groupDoc.data()?.complete) continue
  await groupRef.set({ complete: true }, { merge: true })
  completed++
}

console.log(`✓ marked ${completed} group(s) complete`)
process.exit(0)
