/**
 * set-golden-glove-pick.mjs — One-off: change a single user's Golden Glove
 * prop pick. Resolves the user to a Firebase Auth uid by email (Admin SDK),
 * then sets picks/{uid}.props[GOLDEN_GLOVE_PROP_ID].
 *
 * Dry-run by default (prints current → intended value). Pass --write to commit.
 *
 * Usage (locally):
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json \
 *     node scripts/set-golden-glove-pick.mjs --write
 *
 * Or via the "Run Admin Script" GitHub Action:
 *   script: scripts/set-golden-glove-pick.mjs   args: --write
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// --- what to change ---------------------------------------------------------
const EMAIL = 'dan.barzyk54@gmail.com'
const GOLDEN_GLOVE_PROP_ID = 'a1c2e3d4-1111-4a2b-8c3d-000000000002' // key: goldenGlove
const NEW_PLAYER_ID = '4c9be230-d544-524c-b0b5-0088f571643f'        // Bart Verbruggen (NED, GK)
// ----------------------------------------------------------------------------

const WRITE = process.argv.includes('--write')

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks',
  })
}

const db = getFirestore()
const authUser = await getAuth().getUserByEmail(EMAIL)
const ref = db.doc(`picks/${authUser.uid}`)
const snap = await ref.get()

if (!snap.exists) {
  console.error(`✗ no picks doc for ${EMAIL} (${authUser.uid})`)
  process.exit(1)
}

const current = snap.data()?.props?.[GOLDEN_GLOVE_PROP_ID] ?? null
console.log(`user:    ${EMAIL} (${authUser.uid})`)
console.log(`prop:    goldenGlove (${GOLDEN_GLOVE_PROP_ID})`)
console.log(`current: ${current}`)
console.log(`new:     ${NEW_PLAYER_ID}`)

if (current === NEW_PLAYER_ID) {
  console.log('• already set — nothing to do')
  process.exit(0)
}

if (!WRITE) {
  console.log('\n(dry run — re-run with --write to commit)')
  process.exit(0)
}

// Dotted field path so only this one prop key is touched, not the whole map.
await ref.update({ [`props.${GOLDEN_GLOVE_PROP_ID}`]: NEW_PLAYER_ID })
console.log('\n✓ updated')
process.exit(0)
