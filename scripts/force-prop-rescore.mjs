/**
 * force-prop-rescore.mjs — One-off: forces the prop-winner results
 * (liveData/propResults) and every pick's breakdown.props to be computed
 * under the newly-deployed prop-scoring triggers.
 *
 * Why this exists: scores are written only by Cloud Function triggers, never
 * by a script. The prop engine recomputes winners when a match finishes or
 * the admin saves manual winners — but right after the engine first deploys
 * (or after a fix to its resolvers), there may be no upcoming match write to
 * fire it. Poking config/propResults with a merge write fires
 * onPropOverridesWrite, whose refreshPropResults recomputes winners from all
 * existing matches; if they changed, the liveData/propResults write cascades
 * into onPropResultsWrite, which rescores breakdown.props for every pick.
 * Only the `pokedAt` field is touched — any admin-entered `overrides` map on
 * the doc is left exactly as it is.
 *
 * IMPORTANT: run this only AFTER the "Deploy Cloud Functions" workflow has
 * finished deploying the prop-scoring triggers — otherwise nothing listens
 * for the poke and nothing happens.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/force-prop-rescore.mjs
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

await db.doc('config/propResults').set({ pokedAt: FieldValue.serverTimestamp() }, { merge: true })
console.log('✓ poked config/propResults — onPropOverridesWrite will recompute liveData/propResults and rescore breakdown.props for every pick if the winners changed')
process.exit(0)
