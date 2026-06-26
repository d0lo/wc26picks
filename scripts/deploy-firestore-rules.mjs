/**
 * deploy-firestore-rules.mjs — Releases firebase/firestore.rules as the live
 * Firestore ruleset via the Admin SDK, since no CI workflow deploys rules
 * (firebase-hosting-*.yml only ship the static app; admin-script.yml only
 * runs Node scripts) — this fills that gap using the same admin-script.yml
 * runner the other one-off scripts use, no Firebase CLI required.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/deploy-firestore-rules.mjs
 */

import { readFileSync } from 'fs'
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getSecurityRules } from 'firebase-admin/security-rules'

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks',
  })
}

const rulesSource = readFileSync(new URL('../firebase/firestore.rules', import.meta.url), 'utf8')

await getSecurityRules().releaseFirestoreRulesetFromSource(rulesSource)

console.log('✓ firebase/firestore.rules released as the live Firestore ruleset')
process.exit(0)
