/**
 * force-prop-rescore.mjs — One-off: forces the prop-winner results
 * (liveData/propResults) and every pick's breakdown.props to be recomputed
 * by the deployed prop-scoring triggers.
 *
 * Why this exists: scores are written only by Cloud Function triggers, never
 * by a script. The prop engine recomputes winners when a match finishes or
 * the admin saves manual winners — but right after the engine first deploys
 * (or after a fix to its resolvers or to scorePropPicks), there may be no
 * upcoming match write to fire it.
 *
 * How: first DELETE liveData/propResults, then poke config/propResults with
 * a merge write. The poke fires onPropOverridesWrite → refreshPropResults,
 * which recomputes winners from all existing matches; because the results
 * doc was just deleted, the recompute always differs and always writes,
 * which cascades into onPropResultsWrite rescoring breakdown.props for
 * every pick. Without the delete, a rescore-only fix (winners unchanged,
 * scores stale) would be skipped by the engine's no-change guards. Only the
 * `pokedAt` field is touched on config/propResults — any admin-entered
 * `overrides` map is left exactly as it is, and the recompute re-applies it.
 *
 * IMPORTANT: run this only AFTER the "Deploy Cloud Functions" workflow has
 * finished deploying the prop-scoring triggers — otherwise nothing listens
 * for the poke and the results doc stays deleted until the next match write.
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

await db.doc('liveData/propResults').delete()
console.log('✓ deleted liveData/propResults (guarantees the recompute writes fresh results)')

await db.doc('config/propResults').set({ pokedAt: FieldValue.serverTimestamp() }, { merge: true })
console.log('✓ poked config/propResults — onPropOverridesWrite will recompute liveData/propResults and onPropResultsWrite will rescore breakdown.props for every pick')
process.exit(0)
