// Derives everything the home-screen "Your Champion" hero needs from data
// already replicated client-side: the user's picked champion
// (picks/{uid}.knockout.final[0]) tracked across the tournament. Pure — no
// Firestore/network — so it can be unit tested, mirroring lib/fixtures.js and
// lib/propLeaders.js.
//
// It answers, for the champion team: are they still alive, who knocked them
// out, what was their last result, what's their next (or live) match, and who
// is their top scorer so far.
import { GROUP_TEAMS, TEAM_ID, GROUPS, teamView } from '../data.js'
import { matchWinner, matchLoser, ROUND_LABELS } from '../bracket.js'
import { buildFixtures } from './fixtures.js'
import { resolvePropLeaders } from './propLeaders.js'

// teamId → group letter, for group-stage non-advancement detection.
const GROUP_OF_TEAM = {}
for (const [letter, names] of Object.entries(GROUP_TEAMS)) {
  for (const name of names) GROUP_OF_TEAM[TEAM_ID[name]] = letter
}

// Top scorer on the champion's own team. Reuses the same goal tally the prop
// leaderboard uses (lib/propLeaders.js goldenBoot) so the hero and the Golden
// Boot board can never disagree on a player's count; we just pick the
// highest-scoring entry attributed to the champion's teamId. scoringPlays.scorer
// is a plain ESPN display name (not a roster UUID), so this stays best-effort —
// the same own-goal/duplicate-name caveat that applies to the prop board.
function championTopScorer(championId, matches) {
  const { leaders } = resolvePropLeaders('goldenBoot', matches)
  const top = leaders.find((l) => l.teamId === championId)
  return top ? { name: top.scorer, goals: top.goals } : null
}

// The champion's view of a single fixture: which side they are, the opponent,
// and (once final) the W/L/D outcome. fx is a lib/fixtures.js fixture. Internal
// to this module — tests exercise it through championStatus().
function championSide(fx, championId) {
  if (!fx) return null
  const champ = fx.teams.find((t) => t.teamId === championId) ?? null
  const opp = fx.teams.find((t) => t.teamId !== championId) ?? null
  let outcome = null
  if (fx.state === 'post' && champ?.score != null && opp?.score != null) {
    const cs = Number(champ.score)
    const os = Number(opp.score)
    outcome = cs > os ? 'W' : cs < os ? 'L' : 'D'
  }
  return { fixture: fx, champ, opp, outcome }
}

// Full champion status for the hero. championId is picks/{uid}.knockout.final[0].
// Returns null when no champion has been picked.
export function championStatus({
  championId,
  matches = [],
  scoreboardEvents = [],
  scheduleEvents = [],
  groups = {},
  advancingLetters = [],
}) {
  if (!championId) return null

  const team = teamView(championId)

  // The champion's complete fixture timeline (past + live + future), already
  // sorted by kickoff — buildFixtures merges matches/scoreboard/schedule and
  // derives future knockout matchups from completed feeders.
  const fixtures = buildFixtures(matches, scoreboardEvents, scheduleEvents)
    .filter((f) => f.teams.some((t) => t.teamId === championId))

  const live = fixtures.find((f) => f.state === 'in') ?? null
  const played = fixtures.filter((f) => f.state === 'post')
  const lastResult = played.length ? played[played.length - 1] : null
  const next = fixtures.find((f) => f.state === 'pre') ?? null

  // ── Elimination ──────────────────────────────────────────────────────────
  // Authoritative winner/loser comes from the matches/{eventId} docs (handles
  // penalty shootouts via ESPN's winner flag — see bracket.js matchWinner).
  // The 3rd-place match (round 'third') is excluded: it's not part of the
  // championship path, so losing it is never what knocked a team out — the
  // semifinal already did. Including it would misattribute the elimination
  // (and, since match docs aren't ordered, do so non-deterministically).
  let eliminated = false
  let defeatedBy = null
  let eliminatedRound = null
  let wonItAll = false

  for (const m of matches) {
    if (!m.round || m.round === 'third' || m.status?.state !== 'post') continue
    if (!m.competitors?.some((c) => c.teamId === championId)) continue
    if (matchLoser(m) === championId) {
      eliminated = true
      defeatedBy = teamView(matchWinner(m))
      eliminatedRound = ROUND_LABELS[m.round] ?? null
    }
    if (m.round === 'final' && matchWinner(m) === championId) wonItAll = true
  }

  // Group-stage non-advancement, gated on the backend-owned
  // groups/{letter}.complete flag (Feature 2's onMatchComplete) rather than
  // reimplementing standings math:
  //   - 4th place (idx 3) is out the moment that group finishes.
  //   - 3rd place (idx 2) advancing depends on the cross-group best-thirds
  //     ranking, which is only final once EVERY group is complete — until then
  //     advancingLetters is a partial running ranking, so a 3rd-place team must
  //     not be declared out early (it can flip back in once later groups play).
  if (!eliminated && !wonItAll) {
    const letter = GROUP_OF_TEAM[championId]
    const g = letter ? groups[letter] : null
    if (g?.complete && Array.isArray(g.entries)) {
      const idx = g.entries.findIndex((e) => e.team?.id === championId)
      const groupStageComplete = GROUPS.every((l) => groups[l]?.complete)
      const out = idx === 3 || (idx === 2 && groupStageComplete && !advancingLetters.includes(letter))
      if (out) {
        eliminated = true
        defeatedBy = null
        eliminatedRound = `Group ${letter}`
      }
    }
  }

  return {
    team,
    eliminated,
    defeatedBy,
    eliminatedRound,
    wonItAll,
    live,
    lastResult: lastResult ? championSide(lastResult, championId) : null,
    next,
    topScorer: championTopScorer(championId, matches),
  }
}
