/**
 * set-admin.mjs — One-time grant of users/{uid}.isAdmin = true, resolved to
 * a Firebase Auth uid via the Admin SDK (no hardcoded uid needed). isAdmin
 * can only ever be set this way — Firestore rules block it from client
 * writes.
 *
 * Email is hardcoded below rather than taken as an argv since this runs via
 * the admin-script.yml GitHub Actions runner, which only forwards a script
 * path, not extra args.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/set-admin.mjs
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks',
  })
}

const email = 'dan.barzyk54@gmail.com'

const db = getFirestore()
const authUser = await getAuth().getUserByEmail(email)

await db.collection('users').doc(authUser.uid).set({
  displayName: authUser.displayName ?? null,
  photoURL: authUser.photoURL ?? null,
  isAdmin: true,
}, { merge: true })

console.log(`✓ ${email} (${authUser.uid}) granted isAdmin: true`)
process.exit(0)
