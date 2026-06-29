/**
 * seed-scoring-config.mjs — Writes the scoring config to config/public.scoring.
 * Merges onto the existing doc (e.g. picksLockAt is left untouched).
 *
 * `scoring.props` is the full prop catalog — not just point values. Label,
 * hint, type, and any selector constraints (positionFilter/maxAge/allowNone)
 * live here too, so the app's prop list can change without a code deploy.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/seed-scoring-config.mjs
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

const scoring = {
  // Points per exact predicted position within a group (1st–4th)
  groupExact: { 1: 3, 2: 3, 3: 1, 4: 1 },
  // Bonus when all 4 positions in a group are predicted exactly
  perfectGroupBonus: 1,
  // Points per correctly predicted 3rd-place team that advances (wildcard pick)
  wildcard: 2,
  // Points per correctly predicted knockout-round winner, by round.
  knockout: { r32: 1, r16: 2, qf: 4, sf: 8, final: 16 },
  // Full prop catalog — key, display content, selector constraints, and points.
  // `id` is the stable identity used to key answers in picks/{uid}.props — it
  // must never change once picks have been submitted against it (relabeling
  // `key`/`label`/`hint` is safe; regenerating `id` orphans existing picks).
  props: [
    { id: 'a1c2e3d4-1111-4a2b-8c3d-000000000001', key: 'goldenBoot', label: 'Golden Boot', hint: 'Tournament top scorer', type: 'player', category: 'tournament', points: 5 },
    { id: 'a1c2e3d4-1111-4a2b-8c3d-000000000002', key: 'goldenGlove', label: 'Golden Glove', hint: 'Best goalkeeper', type: 'player', positionFilter: 'G', category: 'tournament', points: 4 },
    { id: 'a1c2e3d4-1111-4a2b-8c3d-000000000003', key: 'goldenBall', label: 'Golden Ball', hint: 'Best player of the tournament', type: 'player', category: 'tournament', points: 5 },
    { id: 'a1c2e3d4-1111-4a2b-8c3d-000000000004', key: 'youngPlayer', label: 'Young Player of the Tournament', hint: 'Best U-21 player', type: 'player', maxAge: 21, category: 'tournament', points: 4 },
    { id: 'a1c2e3d4-1111-4a2b-8c3d-000000000005', key: 'breakoutPlayer', label: 'Breakout Player of the Tournament', hint: 'The under-the-radar player who has a standout tournament (media consensus)', type: 'player', category: 'tournament', points: 6 },
    { id: 'a1c2e3d4-1111-4a2b-8c3d-000000000006', key: 'mostGroupGoals', label: 'Most Goals in Tournament', hint: 'Team that scores the most goals in the tournament', type: 'team', category: 'tournament', points: 3 },
    { id: 'a1c2e3d4-1111-4a2b-8c3d-000000000007', key: 'hatTrickScorer', label: 'Hat Trick Scorer', hint: 'Player to score a hat trick', type: 'player', category: 'tournament', points: 6 },
    { id: 'a1c2e3d4-1111-4a2b-8c3d-000000000008', key: 'mostAssists', label: 'Most Assists', hint: 'Player with the most assists', type: 'player', category: 'tournament', points: 4 },
    { id: 'a1c2e3d4-1111-4a2b-8c3d-000000000009', key: 'mostYellowCards', label: 'Team with Most Yellow Cards', hint: 'Most disciplinary cards received', type: 'team', category: 'tournament', points: 3 },
    { id: 'a1c2e3d4-1111-4a2b-8c3d-000000000010', key: 'cleanGroupTeam', label: 'Clean Group', hint: 'Team that keeps a clean sheet in all 3 group games — or pick No Team', type: 'team', allowNone: true, category: 'tournament', points: 5 },
  ],
}

await db.doc('config/public').set({ scoring }, { merge: true })
console.log('✓ config/public.scoring written')
process.exit(0)
