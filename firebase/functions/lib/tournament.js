// Tournament-format structural helpers — 12 groups of 4 teams, round-robin
// (6 matches per group) — kept separate from scoring.js's pick-scoring math
// since "is the group stage over" is a structural question, not a scoring one.

export const TOTAL_GROUPS = 12
export const GROUP_MATCH_COUNT = 6 // round-robin of 4 teams: C(4,2)

// matchDocs: matches/{eventId} docs (.data()) sharing one groupLetter. True
// only once every one of that group's scheduled matches has actually
// finished, per our own match-status records — not ESPN's secondary
// `gamesPlayed` standings stat, which is one inferential step removed and
// could lag behind (or disagree with) the real status flip we already track.
export function isGroupComplete(matchDocs) {
  return matchDocs.length === GROUP_MATCH_COUNT && matchDocs.every((m) => m?.status?.state === 'post')
}

// groupDocs: groups/{letter} docs (.data()), one per group, each carrying
// the `complete` flag isGroupComplete decided when that group finished.
export function isGroupStageComplete(groupDocs) {
  return groupDocs.length === TOTAL_GROUPS && groupDocs.every((g) => g?.complete === true)
}
