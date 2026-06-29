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

// Whether the "best 3rd place" advancing set is final (group stage over) — once
// it is, wildcard points are locked at their actual value and add no potential.
export function isWildcardSetFinal(groupsByLetter) {
  const letters = Object.keys(groupsByLetter ?? {})
  return letters.length >= GROUPS.length && GROUPS.every((g) => groupsByLetter[g]?.complete === true)
}

// The ceiling. `total`/`breakdown` are the pick's current scores/{uid} values
// (0/{} when unscored). Returns null for a missing pick so callers can hide it.
export function maxPossibleTotal(pick, { total = 0, breakdown = {}, scoring, groupsByLetter, decidedSlots, eliminatedTeams, wildcardsFinal } = {}) {
  if (!pick) return null
  let potential = total

  // Groups: any group not yet complete could still finish exactly as predicted,
  // so replace its provisional/partial score with the full max. Decided groups
  // keep their actual score (already in `total`).
  const gMax = groupMaxPoints(scoring)
  for (const letter of Object.keys(pick.groups ?? {})) {
    if (groupsByLetter?.[letter]?.complete) continue
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

  return potential
}
