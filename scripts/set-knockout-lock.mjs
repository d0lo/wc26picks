/**
 * set-knockout-lock.mjs — One-time write of config/public.knockoutLockAt, the
 * deadline the knockout bracket (BracketView) locks at, separate from the
 * group-stage picks lock (picksLockAt, set by set-picks-lock.mjs). Merges onto
 * the existing doc so picksLockAt / scoring / props are left untouched.
 *
 * Lock time is hardcoded below rather than taken as an argv since this runs via
 * the admin-script.yml GitHub Actions runner, which only forwards a script
 * path, not extra args. Set to 2026-06-29 1:00 PM Eastern (EDT, UTC-4) =
 * 17:00 UTC.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/set-knockout-lock.mjs
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
const knockoutLockAt = Timestamp.fromDate(new Date('2026-06-29T17:00:00Z'))

await db.doc('config/public').set({ knockoutLockAt }, { merge: true })

console.log(`✓ config/public.knockoutLockAt set to ${knockoutLockAt.toDate().toISOString()}`)
process.exit(0)
