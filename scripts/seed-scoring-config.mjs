/**
 * seed-scoring-config.mjs — Writes the scoring point-value table to
 * config/public.scoring. Merges onto the existing doc (e.g. picksLockAt
 * is left untouched).
 *
 * These are the values previously hardcoded in the Picks page UI — this
 * script is how they move into Firestore so they're configurable without
 * a code deploy (e.g. from a future admin screen).
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/seed-scoring-config.mjs
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

const scoring = {
  // Points per exact predicted finishing position within a group (1st–4th)
  groupExact: { 1: 3, 2: 3, 3: 1, 4: 1 },
  // Bonus when all 4 positions in a group are predicted exactly
  perfectGroupBonus: 1,
  // Points per correctly predicted 3rd-place team that advances (wildcard pick)
  wildcard: 2,
  // Points per prop pick, keyed by app/src/data.js PROPS[].key
  props: {
    goldenBoot: 5,
    goldenGlove: 4,
    goldenBall: 5,
    youngPlayer: 4,
    breakoutPlayer: 6,
    mostGroupGoals: 3,
    hatTrickScorer: 6,
    mostAssists: 4,
    mostYellowCards: 3,
    cleanGroupTeam: 5,
  },
}

await db.doc('config/public').set({ scoring, scoringUpdatedAt: FieldValue.serverTimestamp() }, { merge: true })
console.log('✓ config/public.scoring written')
process.exit(0)
