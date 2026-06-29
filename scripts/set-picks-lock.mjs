/**
 * set-picks-lock.mjs — One-time write of config/public.picksLockAt, the
 * timestamp PicksView/router gate on to lock further pick edits. Merges onto
 * the existing doc so scoring/props (written by seed-scoring-config.mjs) are
 * left untouched.
 *
 * Lock time is hardcoded below rather than taken as an argv since this runs
 * via the admin-script.yml GitHub Actions runner, which only forwards a
 * script path, not extra args. Set to the 2026 World Cup opening match
 * kickoff — Mexico vs. South Africa, Estadio Azteca, June 11 2026, 13:00
 * Mexico City time (UTC-6, no DST) = 19:00 UTC.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/set-picks-lock.mjs
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks',
  })
}

const db = getFirestore()
const picksLockAt = Timestamp.fromDate(new Date('2026-06-11T19:00:00Z'))

await db.doc('config/public').set({ picksLockAt }, { merge: true })

console.log(`✓ config/public.picksLockAt set to ${picksLockAt.toDate().toISOString()}`)
process.exit(0)
