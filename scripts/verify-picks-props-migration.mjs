/**
 * verify-picks-props-migration.mjs — Read-only check of every picks/{uid}.props
 * doc against the current config/public.scoring.props catalog. Confirms two
 * things before any cleanup of leftover migration cruft is safe:
 *   1. every catalog id has a non-null value in every doc (no dropped data)
 *   2. counts how many docs still carry old key-keyed fields alongside the
 *      id-keyed ones (the migrate-picks-props-to-id.mjs merge:true bug)
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/verify-picks-props-migration.mjs
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
if (!catalog.length) {
  console.error('✗ config/public.scoring.props is empty — seed it first')
  process.exit(1)
}
const knownIds = new Set(catalog.map(p => p.id))
console.log(`catalog has ${knownIds.size} prop ids`)

const picksSnap = await db.collection('picks').get()
console.log(`scanning ${picksSnap.size} picks doc(s)`)

let missingValues = 0
let staleKeyDocs = 0
let cleanDocs = 0

for (const doc of picksSnap.docs) {
  const props = doc.data().props
  if (!props) { console.log(`  ${doc.id}: no props field at all`); continue }

  const keys = Object.keys(props)
  const missingIds = [...knownIds].filter(id => props[id] == null)
  const staleKeys = keys.filter(k => !knownIds.has(k))

  if (missingIds.length) {
    missingValues++
    console.log(`  ${doc.id}: MISSING values for ids: ${missingIds.join(', ')}`)
  }
  if (staleKeys.length) {
    staleKeyDocs++
    console.log(`  ${doc.id}: ${staleKeys.length} stale key(s): ${staleKeys.join(', ')}`)
  }
  if (!missingIds.length && !staleKeys.length) cleanDocs++
}

console.log(`\n✓ ${cleanDocs} clean, ${staleKeyDocs} with stale keys, ${missingValues} with missing catalog values`)
process.exit(0)
