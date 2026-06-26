/**
 * debug-null-vs-oldkey.mjs — One-off, read-only: across ALL picks docs, for
 * every prop id whose value is literally null, checks whether the doc's
 * matching OLD (pre-migration) key has a real, non-null value. Distinguishes
 * "migration dropped data" from "id key is null but old key also has nothing
 * useful" (i.e. user genuinely never answered that prop).
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/debug-null-vs-oldkey.mjs
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

const configSnap = await db.doc('config/public').get()
const catalog = configSnap.data()?.scoring?.props ?? []
const idToKey = new Map(catalog.map(p => [p.id, p.key]))

const picksSnap = await db.collection('picks').get()

for (const doc of picksSnap.docs) {
  const props = doc.data().props
  if (!props) continue
  const submittedAt = doc.data().submittedAt?.toDate?.()?.toISOString?.() ?? doc.data().submittedAt
  for (const [id, key] of idToKey) {
    const idVal = props[id]
    const oldVal = props[key]
    if (idVal == null && oldVal != null) {
      console.log(`${doc.id} (submittedAt ${submittedAt}): id "${id}" (${key}) is ${JSON.stringify(idVal)} but old key "${key}" = ${JSON.stringify(oldVal)}`)
    }
  }
}
console.log('done')
process.exit(0)
