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

// A World Cup group is 4 teams each playing 3 round-robin games (6 matches).
const GROUP_TEAMS = 4
const GROUP_GAMES_EACH = 3
const GROUP_MATCHES = 6

// Whether the schedule has reached the knockout stage. Every group match is
// played before the first knockout match, so this proves the entire group stage
// is over — the one signal a straggler group's stale standings can't defeat.
// Detected from the scoreboard the leaderboard already subscribes to: an event
// tagged with a knockout round, or a slate of events none of which is a group
// match (knockout events carry no "Group X"). Falls back to any recorded
// knockout match. Empty/rest-day slates don't trigger it, so mid-group-stage
// the per-group checks still apply.
export function knockoutStageReached(scoreboardEvents, matches) {
  const evs = scoreboardEvents ?? []
  if (evs.some((e) => e.round)) return true
  if (evs.length > 0 && !evs.some((e) => e.group)) return true
  return (matches ?? []).some((m) => m.round && ROUNDS.includes(m.round))
}

// Group letters whose round-robin has finished, derived client-side as a
// fallback for a lagging/unwritten groups/{letter}.complete flag. Without this
// the ceiling treats a finished-but-unflagged group as still open: each pick's
// actual group score is swapped back out for the universal group max, so every
// pick's ceiling collapses to the same constant — exactly the "everyone has the
// same max" symptom. Signals, any of which is sufficient:
//   0. the schedule has reached the knockout stage → every group is final
//      (knockoutStageReached), which is what rescues a straggler group whose
//      final matchday wasn't recorded, so its own standings still read 2 games;
//   1. 6 finished group matches recorded for the letter (our own match records);
//   2. the group's standings show every team has played all 3 of its games.
// Signal 2 matters because group-stage match docs written before groupLetter
// was tracked carry no letter (see scripts/backfill-match-group-letters.mjs),
// which makes signal 1 silently find nothing once the group stage is over.
export function finalizedGroupLetters(matches, groupsByLetter, scoreboardEvents) {
  // Once the knockout stage is reached the whole group stage is final, even if
  // an individual group's standings doc is a matchday stale.
  if (knockoutStageReached(scoreboardEvents, matches)) return new Set(GROUPS)

  const set = new Set()

  const counts = {}
  for (const m of matches ?? []) {
    // Group matches carry groupLetter (knockout matches carry round instead).
    if (m.groupLetter && m.status?.state === 'post') {
      counts[m.groupLetter] = (counts[m.groupLetter] ?? 0) + 1
    }
  }
  for (const [letter, n] of Object.entries(counts)) {
    if (n >= GROUP_MATCHES) set.add(letter)
  }

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
  potential += answeredPropMax(pick, scoring) - Number(breakdown.props ?? 0)

  return potential
}
