/**
 * cleanup-stale-prop-keys.mjs — Removes leftover old camelCase prop keys from
 * picks/{uid}.props left behind by migrate-picks-props-to-id.mjs's
 * `merge: true` write (merge patches the new id keys but never deletes the
 * old key-keyed fields already present in the doc).
 *
 * Verified separately (debug-null-vs-oldkey.mjs, full collection scan) that
 * every id-keyed value already holds the real answer — these old keys are
 * pure duplicates, safe to delete. Uses per-field FieldValue.delete() on
 * `props.<oldKey>` paths, never a full `props` overwrite, so nothing else in
 * the map is touched.
 *
 * Defaults to a dry run (logs what would be deleted, writes nothing).
 * Pass --write to actually apply the deletes.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/cleanup-stale-prop-keys.mjs [--write]
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks',
  })
}

const write = process.argv.includes('--write')
const db = getFirestore()

const configSnap = await db.doc('config/public').get()
const catalog = configSnap.data()?.scoring?.props ?? []
if (!catalog.length) {
  console.error('✗ config/public.scoring.props is empty — seed it first')
  process.exit(1)
}
const knownIds = new Set(catalog.map(p => p.id))

const picksSnap = await db.collection('picks').get()
console.log(`scanning ${picksSnap.size} picks doc(s) (${write ? 'WRITE' : 'DRY RUN'})`)

let docsWithStaleKeys = 0
let totalStaleKeys = 0

for (const doc of picksSnap.docs) {
  const props = doc.data().props
  if (!props) continue

  const staleKeys = Object.keys(props).filter(k => !knownIds.has(k))
  if (!staleKeys.length) continue

  docsWithStaleKeys++
  totalStaleKeys += staleKeys.length
  console.log(`  ${doc.id}: ${staleKeys.length} stale key(s): ${staleKeys.join(', ')}`)

  if (write) {
    const updates = {}
    for (const key of staleKeys) updates[`props.${key}`] = FieldValue.delete()
    await db.doc(`picks/${doc.id}`).update(updates)
  }
}

console.log(`\n${write ? '✓ deleted' : 'would delete'} ${totalStaleKeys} stale key(s) across ${docsWithStaleKeys} doc(s)`)
process.exit(0)
