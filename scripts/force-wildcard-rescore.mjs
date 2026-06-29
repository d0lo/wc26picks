/**
 * force-wildcard-rescore.mjs — One-off: forces breakdown.wildcards to be
 * recomputed for every pick under the corrected wildcard scoring logic
 * (a wildcard only counts when the user's predicted 3rd-place team is the
 * team that actually finished 3rd AND advanced).
 *
 * Why this exists: scores are written only by Cloud Function triggers, never
 * by a script. onGroupsWrite is the sole owner of breakdown.wildcards, but it
 * only fires on a groups/{letter} write — which stops happening once the group
 * stage is complete. Re-running seed-scoring-config.mjs does NOT trigger a
 * rescore either: onScoringConfigWrite skips when the scoring values are
 * unchanged. So when the group stage is already over, the only way to refresh
 * already-computed wildcard scores is to poke the group docs and let the
 * (now-redeployed) onGroupsWrite trigger do the recompute.
 *
 * This bumps updatedAt on every groups/{letter} doc with a merge write. The
 * trigger recomputes wildcards from all 12 groups on the first fire (the
 * stored liveData/wildcards has no advancingThirds yet, so its skip-check
 * can't short-circuit), so a single poke rescores every pick; the remaining
 * pokes are harmless no-ops. Only breakdown.wildcards is touched — group and
 * knockout breakdowns are owned by other triggers and are left untouched.
 *
 * IMPORTANT: run this only AFTER the "Deploy Cloud Functions" workflow has
 * finished deploying the corrected triggers — otherwise the old trigger code
 * runs and nothing is fixed.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/force-wildcard-rescore.mjs
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

const groupsSnap = await db.collection('groups').get()
if (groupsSnap.empty) {
  console.log('No groups/* docs found — nothing to poke. Did the group stage start?')
  process.exit(0)
}

for (const doc of groupsSnap.docs) {
  await doc.ref.set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  console.log(`✓ poked groups/${doc.id}`)
}

console.log(`Poked ${groupsSnap.size} group doc(s). onGroupsWrite will recompute breakdown.wildcards for every pick.`)
process.exit(0)
