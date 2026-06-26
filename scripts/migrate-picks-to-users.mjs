/**
 * migrate-picks-to-users.mjs — One-time backfill of users/{uid} from the
 * denormalized name/photoURL currently stored on picks/{uid}, then strips
 * those fields from the picks doc so picks only ever store a uid.
 *
 * Idempotent: a picks doc with no name/photoURL fields left is skipped on
 * re-run; an existing users/{uid} doc is merged (never overwrites isAdmin).
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/migrate-picks-to-users.mjs
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks',
  })
}

const db = getFirestore()
const BATCH_LIMIT = 400

const picksSnap = await db.collection('picks').get()

let batch = db.batch(); let batchCount = 0; const batches = []
let migrated = 0, skipped = 0

for (const doc of picksSnap.docs) {
  const data = doc.data()
  if (data.name === undefined && data.photoURL === undefined) { skipped++; continue }

  const userRef = db.collection('users').doc(doc.id)
  batch.set(userRef, {
    displayName: data.name ?? null,
    photoURL: data.photoURL ?? null,
  }, { merge: true })

  batch.set(doc.ref, {
    name: FieldValue.delete(),
    photoURL: FieldValue.delete(),
  }, { merge: true })

  migrated++
  if (++batchCount % BATCH_LIMIT === 0) { batches.push(batch); batch = db.batch() }
}
batches.push(batch)
for (const b of batches) await b.commit()

console.log(`✓ migrated ${migrated} picks doc(s) to users/{uid}, skipped ${skipped} (already migrated)`)
process.exit(0)
