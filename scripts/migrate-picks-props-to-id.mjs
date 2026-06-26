/**
 * migrate-picks-props-to-id.mjs — One-time remap of picks/{uid}.props from
 * key-keyed (e.g. "goldenBoot") to id-keyed (stable UUID), to match the
 * `id` field added to config/public.scoring.props in seed-scoring-config.mjs.
 *
 * Must run AFTER the new seed (with `id` fields) is live, and BEFORE any
 * user submits/edits picks under the new schema — picks saved by the app in
 * between will already be id-keyed.
 * Idempotent: a doc whose props keys are already all known ids is left
 * untouched, so re-running is safe.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/migrate-picks-props-to-id.mjs
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
const BATCH_LIMIT = 400

const configSnap = await db.doc('config/public').get()
const catalog = configSnap.data()?.scoring?.props ?? []
if (!catalog.length) {
  console.error('✗ config/public.scoring.props is empty — seed it first')
  process.exit(1)
}

const keyToId = new Map(catalog.map(p => [p.key, p.id]))
const knownIds = new Set(catalog.map(p => p.id))

const picksSnap = await db.collection('picks').get()

let batch = db.batch(); let batchCount = 0; const batches = []
let migrated = 0, skipped = 0, unmapped = 0

for (const doc of picksSnap.docs) {
  const props = doc.data().props
  if (!props) { skipped++; continue }

  const keys = Object.keys(props)
  if (keys.every(k => knownIds.has(k))) { skipped++; continue } // already id-keyed

  const remapped = {}
  for (const [key, value] of Object.entries(props)) {
    const id = keyToId.get(key)
    if (!id) {
      console.warn(`  ! ${doc.id}: no id found for prop key "${key}" — dropping`)
      unmapped++
      continue
    }
    remapped[id] = value
  }

  batch.set(db.collection('picks').doc(doc.id), { props: remapped }, { merge: true })
  migrated++
  if (++batchCount % BATCH_LIMIT === 0) { batches.push(batch); batch = db.batch() }
}
batches.push(batch)
for (const b of batches) await b.commit()

console.log(`✓ migrated ${migrated} picks doc(s), skipped ${skipped} (already id-keyed or no props), ${unmapped} unmapped key(s) dropped`)
process.exit(0)
