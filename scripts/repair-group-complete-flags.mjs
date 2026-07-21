/**
 * repair-group-complete-flags.mjs — Diagnose + repair the inputs the prop
 * engine's cleanGroupTeam auto-grading depends on.
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
 *   1. aborts if any match doc has neither groupLetter nor round — run
 *      scripts/backfill-match-group-letters.mjs first, otherwise the flags
 *      (and any re-grade) would be derived from known-incomplete tagging;
 *   2. prints, per group: match-doc counts (tagged/post), the complete flag,
 *      and each team's played/conceded tally (the clean-sheet evidence);
 *   3. sets groups/{letter}.complete = true wherever isGroupComplete — the
 *      exact rule markGroupCompleteIfDecided applies, imported from the same
 *      module — says the group is done. (These writes fire onGroupsWrite,
 *      which no-ops behind its isGroupStageOver date gate once the group
 *      stage is over — the only period this repair is meant for.)
 *
 * It does NOT force a re-grade: after repairing, run
 * scripts/force-prop-rescore.mjs (it owns the poke protocol and its
 * deploy-ordering caveats) so the engine recomputes winners under the
 * repaired flags and rescores every pick.
 *
 * Idempotent — safe to re-run; a run with nothing to repair changes nothing.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/repair-group-complete-flags.mjs
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { isGroupComplete } from '../firebase/functions/lib/tournament.js'

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
  console.error(`✗ ${untagged.length} match doc(s) have neither groupLetter nor round — run scripts/backfill-match-group-letters.mjs first, then re-run this script: ${untagged.map((m) => m.id).join(', ')}`)
  process.exit(1)
}

console.log('Per-group state (tagged matches / post / complete flag):')
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

  if (isGroupComplete(group) && !complete) {
    await db.doc(`groups/${letter}`).set({ complete: true }, { merge: true })
    repaired += 1
    console.log(`  ✓ set groups/${letter}.complete = true (isGroupComplete per our own match records)`)
  }
}

const entry = propResultsSnap.data()?.results
console.log(`\nCurrent liveData/propResults prop entries: ${entry ? Object.keys(entry).length : '(doc missing)'}`)
console.log(`Repaired complete flags: ${repaired}`)
if (repaired > 0) {
  console.log('→ now run scripts/force-prop-rescore.mjs so the engine re-grades props under the repaired flags')
}
process.exit(0)
