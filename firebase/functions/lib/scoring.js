// Pure scoring logic for the auto-scoring engine — no Firestore/ESPN
// dependencies, so it can be unit tested in isolation from the trigger.

// Scores one group's predicted team order against that group's actual
// standings (sorted by points desc, as written to groups/{letter}.entries).
// predicted: ordered array of 4 team UUIDs (1st..4th place picks).
export function scoreGroupPrediction(predicted, standings, scoring) {
  const actualOrder = (standings ?? []).map((e) => e.team?.id)
  if (!Array.isArray(predicted) || predicted.length === 0 || actualOrder.length === 0) {
    return { points: 0, exactPositions: 0 }
  }

  let points = 0
  let exactPositions = 0
  predicted.forEach((teamId, i) => {
    if (teamId && actualOrder[i] === teamId) {
      points += Number(scoring?.groupExact?.[i + 1] ?? 0)
      exactPositions += 1
    }
  })
  if (exactPositions === 4 && actualOrder.length === 4) {
    points += Number(scoring?.perfectGroupBonus ?? 0)
  }
  return { points, exactPositions }
}

// How many third-place teams advance to the knockout round in a 12-group,
// 4-team-per-group format.
export const ADVANCING_THIRD_PLACE_COUNT = 8

// Ranks every group's 3rd-place team to decide which "best third-place"
// teams advance. Ties broken by points then goal differential — ESPN's
// World Cup standings table doesn't expose goals-for/against separately,
// only the net differential, so that's as far as the tiebreak can go.
export function rankThirdPlaceTeams(groupsByLetter) {
  const thirds = Object.entries(groupsByLetter ?? {})
    .map(([letter, entries]) => entries?.[2] && { letter, ...entries[2] })
    .filter(Boolean)
  return thirds.sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || (b.goalDiff ?? 0) - (a.goalDiff ?? 0))
}

// Same letters rankThirdPlaceTeams ranks, narrowed to the advancing set —
// split out so callers scoring many picks in one trigger invocation (e.g.
// onMatchComplete) can compute this once and reuse it, instead of every pick
// re-ranking all 12 groups' third-place teams from scratch.
export function advancingThirdPlaceLetters(groupsByLetter) {
  return new Set(rankThirdPlaceTeams(groupsByLetter).slice(0, ADVANCING_THIRD_PLACE_COUNT).map((t) => t.letter))
}

// pickedLetters: groups the user picked as "3rd place advances" (wildcards).
// advancing: a Set of advancing letters, as returned by advancingThirdPlaceLetters.
export function creditWildcardPicks(pickedLetters, advancing, scoring) {
  if (!Array.isArray(pickedLetters) || pickedLetters.length === 0) return 0
  const perPick = Number(scoring?.wildcard ?? 0)
  return pickedLetters.filter((letter) => advancing.has(letter)).length * perPick
}

// Sums a breakdown.groups map ({ [letter]: points }) for the leaderboard
// total. Returns null (not 0) when no group has been scored yet, so callers
// can distinguish "not started" from "scored at zero" in the UI.
export function sumGroupPoints(groups) {
  if (!groups || Object.keys(groups).length === 0) return null
  return Object.values(groups).reduce((sum, v) => sum + v, 0)
}

// Full groups+wildcards breakdown for one pick against every group with
// standings so far. Unlike onMatchComplete's single-group patch, this
// re-derives every group from scratch — needed when the point values
// themselves change, since a stale group's score was computed under the old
// values and won't otherwise be touched again.
// advancing: a Set of advancing letters, as returned by
// advancingThirdPlaceLetters — passed in rather than recomputed here so the
// ranking has exactly one call site (onGroupsWrite) across the whole engine.
export function scorePick(pick, groupsByLetter, advancing, scoring) {
  const groups = {}
  for (const [letter, standings] of Object.entries(groupsByLetter ?? {})) {
    if (!standings?.length) continue
    groups[letter] = scoreGroupPrediction(pick?.groups?.[letter], standings, scoring).points
  }
  const wildcards = creditWildcardPicks(pick?.wildcards, advancing, scoring)
  return { groups, wildcards }
}
