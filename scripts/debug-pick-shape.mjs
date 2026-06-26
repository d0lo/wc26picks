/**
 * debug-pick-shape.mjs — One-off diagnostic: dumps the shape of a specific
 * user's picks/{uid} doc (field types, array-ness) to find why PicksView's
 * pre-populate watcher might be throwing for users with an existing pick.
 *
 * Usage (via admin-script.yml — no env var support, email is hardcoded below):
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/debug-pick-shape.mjs
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

const auth = getAuth()
const db = getFirestore()

const userRecord = await auth.getUserByEmail(email)
const uid = userRecord.uid
console.log('uid:', uid)

const snap = await db.doc(`picks/${uid}`).get()
if (!snap.exists) {
  console.log('No picks doc found for this uid.')
  process.exit(0)
}

const data = snap.data()
console.log('top-level keys:', Object.keys(data))
console.log('groups type:', typeof data.groups, Array.isArray(data.groups) ? 'array' : 'not-array')
if (data.groups) {
  for (const [g, v] of Object.entries(data.groups)) {
    console.log(`  groups.${g}:`, Array.isArray(v) ? `array[${v.length}]` : typeof v, JSON.stringify(v))
  }
}
console.log('wildcards type:', typeof data.wildcards, Array.isArray(data.wildcards) ? `array[${data.wildcards?.length}]` : 'not-array', JSON.stringify(data.wildcards))
console.log('props type:', typeof data.props, Array.isArray(data.props) ? 'array' : 'not-array')
if (data.props) {
  console.log('  props keys:', Object.keys(data.props))
  console.log('  props sample:', JSON.stringify(data.props).slice(0, 500))
}
console.log('submittedAt:', data.submittedAt)

const userSnap = await db.doc(`users/${uid}`).get()
if (!userSnap.exists) {
  console.log('No users/{uid} doc found for this uid.')
} else {
  const userData = userSnap.data()
  console.log('users doc keys:', Object.keys(userData))
  console.log('users doc:', JSON.stringify(userData))
  console.log('isAdmin in doc:', 'isAdmin' in userData)
}
process.exit(0)
