// Pure scoring logic for the auto-scoring engine — no Firestore/ESPN
// dependencies, so it can be unit tested in isolation from the trigger.
import { ROUND_POINTS } from './bracket.js'

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

// A wildcard pick names a group whose 3rd-place team the user expects to
// advance. It only counts when BOTH hold:
//   1. the team the user predicted to finish 3rd in that group
//      (pick.groups[letter][2]) is the team that actually finished 3rd, and
//   2. that 3rd-place team is in the advancing set.
// Getting the group right but the team wrong — e.g. the user's predicted
// 3rd-place team finished 1st/2nd ("made it out of the group") and a
// different team took the advancing 3rd spot — earns nothing. The picked team
// must be correctly placed into 3rd, not merely advance by any route.
// groupsByLetter: { [letter]: standings[] } actual standings (each entry has
// `.team.id`), as written to groups/{letter}.entries.
export function isWildcardCorrect(pick, groupsByLetter, advancing, letter) {
  if (!advancing.has(letter)) return false
  const predictedThird = pick?.groups?.[letter]?.[2]
  const actualThird = groupsByLetter?.[letter]?.[2]?.team?.id
  return Boolean(predictedThird) && predictedThird === actualThird
}

// Credits the configured per-pick points for each of the user's wildcard
// picks that is correct per isWildcardCorrect.
export function creditWildcardPicks(pick, groupsByLetter, advancing, scoring) {
  const pickedLetters = pick?.wildcards
  if (!Array.isArray(pickedLetters) || pickedLetters.length === 0) return 0
  const perPick = Number(scoring?.wildcard ?? 0)
  return pickedLetters.filter((letter) => isWildcardCorrect(pick, groupsByLetter, advancing, letter)).length * perPick
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
  const wildcards = creditWildcardPicks(pick, groupsByLetter, advancing, scoring)
  return { groups, wildcards }
}

// Total prop points for one pick against the resolved prop winners
// (liveData/propResults.results, see lib/props.js computePropResults).
// pickProps: picks/{uid}.props — { [propId]: playerUUID | teamUUID | null }
// where null is a deliberate "No Team" answer (allowNone props), and an
// absent id means the prop was never answered (added after submission).
// catalog: config/public.scoring.props. A results entry with no winners and
// no noWinner flag (auto-resolved leaders that couldn't be matched to roster
// UUIDs) is treated as unresolved — nobody scores, nobody is marked wrong.
export function scorePropPicks(pickProps, catalog, results) {
  let total = 0
  for (const prop of catalog ?? []) {
    if (prop.archived) continue
    const entry = results?.[prop.id]
    if (!entry || (!entry.noWinner && !entry.winners?.length)) continue
    if (!pickProps || !(prop.id in pickProps)) continue
    const picked = pickProps[prop.id]
    const correct = entry.noWinner ? picked === null : picked != null && entry.winners.includes(picked)
    if (correct) total += Number(prop.points ?? 0)
  }
  return total
}

// Decides the winner of a finished knockout match. ESPN's `winner` flag is
// the authoritative signal (it accounts for penalty shootouts, where the
// score alone ends level) — score comparison is only a fallback for the
// rare case that flag is missing.
export function determineKnockoutWinner(competitors) {
  const winner = competitors?.find((c) => c.winner)
  if (winner) return winner.teamId
  if (!Array.isArray(competitors) || competitors.length !== 2) return null
  const [a, b] = competitors
  if (a.score == null || b.score == null || a.score === b.score) return null
  return Number(a.score) > Number(b.score) ? a.teamId : b.teamId
}

// Points for one knockout-round pick: the round's point value if the pick
// matches the match winner, else 0. Point values are config-driven
// (config/public.scoring.knockout), falling back to the ROUND_POINTS defaults
// when a round isn't set in config — same pattern as the group/wildcard values.
export function scoreKnockoutSlot(pickedTeamId, winnerTeamId, round, scoring) {
  if (!pickedTeamId || !winnerTeamId || pickedTeamId !== winnerTeamId) return 0
  return Number(scoring?.knockout?.[round] ?? ROUND_POINTS[round] ?? 0)
}

// Full knockout breakdown for one pick: { [round]: { [slotIndex]: points } }.
// koWinners is { [round]: { [slotIndex]: winnerTeamId } } across finished
// knockout matches. Mirrors scorePick (groups): re-derives every scored slot
// from scratch, needed when point values change since a stale slot's score was
// computed under the old values and isn't otherwise revisited.
export function scoreKnockout(pickKnockout, koWinners, scoring) {
  const out = {}
  for (const [round, slots] of Object.entries(koWinners ?? {})) {
    for (const [slotIndex, winnerTeamId] of Object.entries(slots ?? {})) {
      const picked = pickKnockout?.[round]?.[Number(slotIndex)]
      ;(out[round] ??= {})[slotIndex] = scoreKnockoutSlot(picked, winnerTeamId, round, scoring)
    }
  }
  return out
}

// Sums a breakdown.knockout map ({ [round]: { [slotIndex]: points } }) for
// the leaderboard total. Returns null (not 0) when nothing's been scored
// yet, mirroring sumGroupPoints' not-started/scored-at-zero distinction.
export function sumKnockoutPoints(knockout) {
  if (!knockout || Object.keys(knockout).length === 0) return null
  let total = 0
  let any = false
  for (const slots of Object.values(knockout)) {
    for (const pts of Object.values(slots ?? {})) {
      total += pts
      any = true
    }
  }
  return any ? total : null
}
