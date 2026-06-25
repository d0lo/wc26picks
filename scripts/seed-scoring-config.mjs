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
  // Full prop catalog — key, display content, selector constraints, and points
  props: [
    { key: 'goldenBoot', label: 'Golden Boot', hint: 'Tournament top scorer', type: 'player', category: 'tournament', points: 5 },
    { key: 'goldenGlove', label: 'Golden Glove', hint: 'Best goalkeeper', type: 'player', positionFilter: 'G', category: 'tournament', points: 4 },
    { key: 'goldenBall', label: 'Golden Ball', hint: 'Best player of the tournament', type: 'player', category: 'tournament', points: 5 },
    { key: 'youngPlayer', label: 'Young Player of the Tournament', hint: 'Best U-21 player', type: 'player', maxAge: 21, category: 'tournament', points: 4 },
    { key: 'breakoutPlayer', label: 'Breakout Player of the Tournament', hint: 'The under-the-radar player who has a standout tournament (media consensus)', type: 'player', category: 'tournament', points: 6 },
    { key: 'mostGroupGoals', label: 'Most Goals in Group Stage', hint: 'Team that scores the most goals in the group stage', type: 'team', category: 'group', points: 3 },
    { key: 'hatTrickScorer', label: 'Hat Trick Scorer', hint: 'Player to score a hat trick', type: 'player', category: 'tournament', points: 6 },
    { key: 'mostAssists', label: 'Most Assists', hint: 'Player with the most assists', type: 'player', category: 'tournament', points: 4 },
    { key: 'mostYellowCards', label: 'Team with Most Yellow Cards', hint: 'Most disciplinary cards received', type: 'team', category: 'tournament', points: 3 },
    { key: 'cleanGroupTeam', label: 'Clean Group', hint: 'Team that keeps a clean sheet in all 3 group games — or pick No Team', type: 'team', allowNone: true, category: 'group', points: 5 },
  ],
}

await db.doc('config/public').set({ scoring }, { merge: true })
console.log('✓ config/public.scoring written')
process.exit(0)
