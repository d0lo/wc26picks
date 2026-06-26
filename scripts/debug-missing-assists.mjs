/**
 * debug-missing-assists.mjs — One-off, read-only: dumps the raw props.mostAssists
 * (old key) and props["a1c2e3d4-...-010"] (new id key) values for the 4 docs
 * verify-picks-props-migration.mjs flagged as missing that id, to find out
 * whether the value is truly absent or just literally null.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/debug-missing-assists.mjs
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks',
  })
}

const db = getFirestore()
const ID = 'a1c2e3d4-1111-4a2b-8c3d-000000000010'
const uids = [
  '8ovaSuqU6sd4FvyGDk722BSXwhN2',
  'MyZvo9c2oyNyvm1WKXd37SXxk4H2',
  'RHyslRrVxrUfhZfc5xMMMbNIidA2',
  'Yn38K1BMgTQK6E3ItoqBRW7RmIX2',
]

for (const uid of uids) {
  const snap = await db.doc(`picks/${uid}`).get()
  const props = snap.data()?.props ?? {}
  console.log(`${uid}:`)
  console.log(`  has key "mostAssists": ${'mostAssists' in props} -> ${JSON.stringify(props.mostAssists)}`)
  console.log(`  has key "${ID}": ${ID in props} -> ${JSON.stringify(props[ID])}`)
  console.log(`  submittedAt: ${snap.data()?.submittedAt?.toDate?.()?.toISOString?.() ?? snap.data()?.submittedAt}`)
  console.log(`  all keys: ${Object.keys(props).join(', ')}`)
}
process.exit(0)
