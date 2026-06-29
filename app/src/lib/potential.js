// Pure "max possible finish" projection — the ceiling a pick can still reach.
//
// Given a pick, that pick's current scored breakdown/total, and the live
// results so far, returns the highest total the pick can still finish with:
// everything already DECIDED stays at its actual value (it's baked into the
// pick's current `total`), while everything still UNDECIDED is assumed to hit
// (its provisional/zero score is swapped for the maximum it could award) — with
// one realism bound: a knockout pick for a team already eliminated from the
// real bracket can't win, so it adds nothing. The ceiling is what's still
// reachable given the teams left alive, not every unplayed slot at full value.
//
// Computed as a delta from the current total rather than re-derived from
// scratch, so it can't double-count the live/incremental group scores the
// backend already writes mid-group, and it's guaranteed that
// potential >= total, with equality once the whole tournament is decided.
//
// Kept Firestore-free (mirrors the backend's lib/scoring.js) so it has one
// home shared by the leaderboard column and the score card, and stays testable.
import { GROUPS } from '../data.js'
import { ROUNDS, ROUND_SIZE, ROUND_POINTS, matchLoser } from '../bracket.js'
import { isGroupStageComplete } from './tournament.js'

// Max points a perfectly-correct group prediction can earn under `scoring`.
export function groupMaxPoints(scoring) {
  const exact = scoring?.groupExact
  if (!exact) return 0
  const sum = Object.values(exact).reduce((t, v) => t + Number(v ?? 0), 0)
  return sum + Number(scoring?.perfectGroupBonus ?? 0)
}

// Per-round knockout point values, config overrides on top of the defaults.
function knockoutRoundPoints(scoring) {
  return { ...ROUND_POINTS, ...(scoring?.knockout ?? {}) }
}

// Set of `${round}_${slot}` knockout slots whose real match has finished —
// those are decided, so their points are fixed (already in the pick's total)
// and contribute no further potential.
export function decidedKnockoutSlots(matches) {
  const set = new Set()
  for (const m of matches ?? []) {
    if (m.round && m.slot && ROUNDS.includes(m.round) && m.status?.state === 'post') {
      set.add(`${m.round}_${m.slot}`)
    }
  }
  return set
}

// Teams already knocked out of the real bracket — the losers of every finished
// knockout match. A pick for a team in this set can no longer win any later
// slot, so its remaining rounds add nothing to the ceiling. This is what keeps
// the knockout potential honest: it's bounded by the teams still alive, not by
// every unplayed slot blindly counting at full points.
export function knockoutEliminatedTeams(matches) {
  const out = new Set()
  for (const m of matches ?? []) {
    if (!m.round || m.status?.state !== 'post') continue
    const loser = matchLoser(m)
    if (loser) out.add(loser)
  }
  return out
}

// A World Cup group is 4 teams each playing 3 round-robin games.
const GROUP_TEAMS = 4
const GROUP_GAMES_EACH = 3

// Group letters whose round-robin has finished — these lock their actual score
// into the pick's `total` instead of leaving the universal group max counting
// toward the ceiling. Without this a finished-but-unflagged group reads as still
// open, each pick's real group score is swapped back out for the max, and every
// ceiling collapses to the same constant — the "everyone has the same max"
// symptom. Two layers:
//   - once the whole group stage is over (isGroupStageComplete — the same
//     authoritative signal App.vue gates the knockout window on), every group is
//     final, which is what rescues a straggler group whose standings doc lags a
//     matchday behind its already-"post" matches;
//   - before that, lock each group that has individually finished (every team
//     has played all 3 of its games), so a group that wraps a day early stops
//     counting toward the ceiling immediately.
export function finalizedGroupLetters(matches, groupsByLetter) {
  if (isGroupStageComplete(matches)) return new Set(GROUPS)

  const set = new Set()
  for (const [letter, group] of Object.entries(groupsByLetter ?? {})) {
    const entries = group?.entries
    if (
      Array.isArray(entries) &&
      entries.length >= GROUP_TEAMS &&
      entries.every((e) => Number(e?.gamesPlayed ?? 0) >= GROUP_GAMES_EACH)
    ) {
      set.add(letter)
    }
  }
  return set
}

// Whether a single group's standings are final — the persisted complete flag,
// or our own match-records fallback (finalizedGroupLetters) when it lags.
function isGroupFinal(letter, groupsByLetter, finalizedGroups) {
  return groupsByLetter?.[letter]?.complete === true || finalizedGroups?.has(letter) === true
}

// Whether the "best 3rd place" advancing set is final (group stage over) — once
// it is, wildcard points are locked at their actual value and add no potential.
// Final only when every one of the 12 groups is itself final.
export function isWildcardSetFinal(groupsByLetter, finalizedGroups) {
  return GROUPS.every((g) => isGroupFinal(g, groupsByLetter, finalizedGroups))
}

// Sum of point values for every prop this pick has actually answered — the most
// it could still earn from props. A pick is "answered" when its id is present in
// pick.props, including an explicit null ("No Team") for allowNone props, which
// is a real prediction that can still hit; an absent prop earns nothing.
function answeredPropMax(pick, scoring) {
  const catalog = scoring?.props
  if (!Array.isArray(catalog) || !pick?.props) return 0
  let max = 0
  for (const prop of catalog) {
    if (prop?.archived) continue
    if (Object.prototype.hasOwnProperty.call(pick.props, prop.id) && pick.props[prop.id] !== undefined) {
      max += Number(prop.points ?? 0)
    }
  }
  return max
}

// The ceiling. `total`/`breakdown` are the pick's current scores/{uid} values
// (0/{} when unscored). Returns null for a missing pick so callers can hide it.
export function maxPossibleTotal(pick, { total = 0, breakdown = {}, scoring, groupsByLetter, finalizedGroups, decidedSlots, eliminatedTeams, wildcardsFinal } = {}) {
  if (!pick) return null
  let potential = total

  // Groups: any group not yet final could still finish exactly as predicted,
  // so replace its provisional/partial score with the full max. Final groups
  // keep their actual score (already in `total`).
  const gMax = groupMaxPoints(scoring)
  for (const letter of Object.keys(pick.groups ?? {})) {
    if (isGroupFinal(letter, groupsByLetter, finalizedGroups)) continue
    potential += gMax - Number(breakdown.groups?.[letter] ?? 0)
  }

  // Wildcards: until the advancing set is final, every wildcard pick could
  // still come in.
  if (!wildcardsFinal) {
    const perPick = Number(scoring?.wildcard ?? 0)
    const max = (pick.wildcards?.length ?? 0) * perPick
    potential += max - Number(breakdown.wildcards ?? 0)
  }

  // Knockout: a picked slot whose match hasn't finished can still earn its
  // points only if that team is still alive — a team already eliminated from
  // the real bracket can't win this slot, so it adds nothing.
  const koPts = knockoutRoundPoints(scoring)
  for (const round of ROUNDS) {
    for (let i = 0; i < ROUND_SIZE[round]; i++) {
      const picked = pick.knockout?.[round]?.[i]
      if (!picked) continue
      if (decidedSlots?.has(`${round}_${i + 1}`)) continue
      if (eliminatedTeams?.has(picked)) continue
      potential += Number(koPts[round] ?? 0) - Number(breakdown.knockout?.[round]?.[i] ?? 0)
    }
  }

  // Props: tournament-long awards (golden boot, most cards, etc.) that don't
  // resolve until the end, so every answered prop can still hit. Add the full
  // answered-prop max minus whatever's already scored (breakdown.props is the
  // aggregate the backend sums into `total`; 0 until a prop engine writes it).
  // Clamp at 0 so a prop archived *after* it scored — its points still baked
  // into breakdown.props but dropped from answeredPropMax — can't push the
  // ceiling below the pick's own total.
  potential += Math.max(0, answeredPropMax(pick, scoring) - Number(breakdown.props ?? 0))

  return potential
}
