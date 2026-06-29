/**
 * refresh-stale-match-status.mjs — Re-fetches the ESPN summary for any
 * matches/{eventId} doc whose status.state isn't "post" yet and rewrites it,
 * mirroring processMatchUpdate (firebase/functions/index.js) exactly.
 *
 * Why this is needed: espnPoller only polls ESPN's default (i.e. "today's")
 * /scoreboard, with no explicit `dates` param. If a match is still "in" when
 * ESPN's own server-side day rolls over, it falls out of that feed before
 * onScoreboardWrite ever observes its in->post flip — so matches/{eventId}
 * is left permanently stuck on a stale status, with nothing client- or
 * server-side ever re-checking it. This is a one-off repair for any match(es)
 * already stuck that way; it does not fix the underlying poller gap.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/refresh-stale-match-status.mjs [eventId...]
 *
 * With no eventId args, scans every matches/{eventId} doc whose
 * status.state isn't "post" and refreshes each. Pass explicit eventIds to
 * target specific matches instead (skips the full-collection scan).
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { fetchSummary } from '../firebase/functions/lib/espn.js'
import { normalizeMatch } from '../firebase/functions/lib/normalize.js'
import { isGroupComplete } from '../firebase/functions/lib/tournament.js'

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks',
  })
}

const db = getFirestore()

// Same logic as index.js's markGroupCompleteIfDecided — only writes on the
// false→true transition, so re-running this script is always safe.
async function markGroupCompleteIfDecided(letter) {
  const groupRef = db.doc(`groups/${letter}`)
  const [groupDoc, matchesSnap] = await Promise.all([
    groupRef.get(),
    db.collection('matches').where('groupLetter', '==', letter).get(),
  ])
  if (groupDoc.data()?.complete) return
  if (!isGroupComplete(matchesSnap.docs.map((d) => d.data()))) return
  await groupRef.set({ complete: true }, { merge: true })
}

const explicitIds = process.argv.slice(2)
let targets
if (explicitIds.length > 0) {
  const snaps = await Promise.all(explicitIds.map((id) => db.doc(`matches/${id}`).get()))
  targets = snaps.filter((s) => s.exists).map((s) => ({ id: s.id, groupLetter: s.data().groupLetter ?? null }))
} else {
  const snap = await db.collection('matches').get()
  targets = snap.docs
    .filter((d) => d.data().status?.state !== 'post')
    .map((d) => ({ id: d.id, groupLetter: d.data().groupLetter ?? null }))
}

console.log(`Refreshing ${targets.length} match(es): ${targets.map((t) => t.id).join(', ') || '(none)'}`)

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

    console.log(`  ✓ ${eventId}: now ${match.status.state}`)

    if (groupLetter && match.status.state === 'post') {
      await markGroupCompleteIfDecided(groupLetter)
    }
  } catch (err) {
    console.warn(`  ! ${eventId}: refresh failed — ${err.message}`)
  }
}

process.exit(0)
