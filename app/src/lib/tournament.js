// Tournament-structure helpers, kept Firestore-free so they can be shared
// across views (App.vue's knockout-window gating, the leaderboard's max-possible
// ceiling) and unit-tested in isolation.

// 12 groups of 4 teams, each playing 3 round-robin games → 72 group matches.
export const GROUP_STAGE_MATCH_COUNT = 72

// Whether the group stage is over.
//
// Group-stage completeness can't be derived from groupLetter — production
// matches/{eventId} docs were found to be missing groupLetter (and round/slot)
// entirely, not just on legacy data but across the whole group stage (see
// scripts/backfill-match-group-letters.mjs), so per-group counts on that field
// always undercount. status.state is reliably correct on every doc regardless,
// and knockout matches always carry a `round` (derived fresh from a fixed
// eventId→round/slot table, unaffected by that gap). So:
//   - any knockout match having data means the group stage is definitionally over;
//   - otherwise it's done once all 72 group matches (round == null) are "post".
// Use >= (not ===) so a knockout doc that ever lands untagged (missing
// round/slot) inflating the group-match count can't hide the bracket again.
export function isGroupStageComplete(matches) {
  const ms = matches ?? []
  if (ms.some((m) => m.round)) return true
  const groupMatches = ms.filter((m) => m.round == null)
  return groupMatches.length >= GROUP_STAGE_MATCH_COUNT && groupMatches.every((m) => m.status?.state === 'post')
}
