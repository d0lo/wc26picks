/**
 * repair-group-complete-flags.mjs — Diagnose + repair the inputs the prop
 * engine's cleanGroupTeam auto-grading depends on, then force a re-grade.
 *
 * cleanGroupTeam resolves in two ways (lib/props.js):
 *   - winners: teams with all 3 group games played (groupLetter-tagged, post)
 *     and 0 goals conceded — needs every such match doc tagged correctly;
 *   - noWinner ("No Team" wins): only once isGroupStageComplete is true,
 *     which requires ALL 12 groups/{letter}.complete flags. Those flags are
 *     written by markGroupCompleteIfDecided at group-match completion — if
 *     that code deployed after the group stage ended, no flag was ever set
 *     and the prop sits "Ungraded" forever.
 *
 * This script:
 *   1. prints, per group: match-doc counts (tagged/post), the complete flag,
 *      and each team's played/conceded tally (the clean-sheet evidence);
 *   2. sets groups/{letter}.complete = true where our own match records show
 *      all 6 matches post — same rule markGroupCompleteIfDecided applies
 *      (onGroupsWrite ignores these writes post-group-stage, so no cascade);
 *   3. flags suspect match docs (no groupLetter AND no knockout round) that
 *      would need scripts/backfill-match-group-letters.mjs first;
 *   4. deletes liveData/propResults and pokes config/propResults so the
 *      deployed engine recomputes winners under the repaired flags and
 *      rescores every pick (same mechanism as force-prop-rescore.mjs).
 *
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/repair-group-complete-flags.mjs
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
const LETTERS = 'ABCDEFGHIJKL'.split('')

const [groupsSnap, matchesSnap, propResultsSnap] = await Promise.all([
  db.collection('groups').get(),
  db.collection('matches').get(),
  db.doc('liveData/propResults').get(),
])

const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
const groupByLetter = Object.fromEntries(groupsSnap.docs.map((d) => [d.id, d.data()]))

const untagged = matches.filter((m) => !m.groupLetter && !m.round)
if (untagged.length) {
  console.log(`⚠ ${untagged.length} match doc(s) have neither groupLetter nor round — run scripts/backfill-match-group-letters.mjs first: ${untagged.map((m) => m.id).join(', ')}`)
}

console.log('\nPer-group state (tagged matches / post / complete flag):')
let repaired = 0
for (const letter of LETTERS) {
  const group = matches.filter((m) => m.groupLetter === letter)
  const post = group.filter((m) => m.status?.state === 'post')
  const complete = groupByLetter[letter]?.complete === true

  // Clean-sheet tally for this group — the same evidence the engine's
  // cleanGroupTeamWinners uses, printed so the expected auto-grade is
  // visible in the workflow log.
  const byTeam = {}
  for (const m of post) {
    for (const c of m.competitors ?? []) {
      const opponent = (m.competitors ?? []).find((o) => o.teamId !== c.teamId)
      byTeam[c.teamId] ??= { played: 0, conceded: 0 }
      byTeam[c.teamId].played += 1
      const oppScore = opponent?.score
      byTeam[c.teamId].conceded += oppScore == null ? Infinity : Number(oppScore)
    }
  }
  const clean = Object.entries(byTeam).filter(([, t]) => t.played === 3 && t.conceded === 0)

  console.log(`  ${letter}: ${group.length} tagged, ${post.length} post, complete=${complete}${clean.length ? ` — CLEAN SHEETS: ${clean.map(([id]) => id).join(', ')}` : ''}`)

  if (post.length === 6 && !complete) {
    await db.doc(`groups/${letter}`).set({ complete: true }, { merge: true })
    repaired += 1
    console.log(`  ✓ set groups/${letter}.complete = true (all 6 matches post per our own records)`)
  }
}

const entry = propResultsSnap.data()?.results
console.log(`\nCurrent liveData/propResults prop entries: ${entry ? Object.keys(entry).length : '(doc missing)'}`)
console.log(`Repaired complete flags: ${repaired}`)

await db.doc('liveData/propResults').delete()
await db.doc('config/propResults').set({ pokedAt: FieldValue.serverTimestamp() }, { merge: true })
console.log('✓ deleted liveData/propResults and poked config/propResults — the engine will re-grade all props and rescore every pick')
process.exit(0)
