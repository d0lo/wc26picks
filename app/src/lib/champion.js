// Derives everything the home-screen "Your Champion" hero needs from data
// already replicated client-side: the user's picked champion
// (picks/{uid}.knockout.final[0]) tracked across the tournament. Pure — no
// Firestore/network — so it can be unit tested, mirroring lib/fixtures.js and
// lib/propLeaders.js.
//
// It answers, for the champion team: are they still alive, who knocked them
// out, what was their last result, what's their next (or live) match, and who
// is their top scorer so far.
import { TEAM_BY_ID, GROUP_TEAMS, TEAM_ID } from '../data.js'
import { matchWinner, matchLoser, ROUND_LABELS } from '../bracket.js'
import { buildFixtures } from './fixtures.js'

// teamId → group letter, for group-stage non-advancement detection.
const GROUP_OF_TEAM = {}
for (const [letter, names] of Object.entries(GROUP_TEAMS)) {
  for (const name of names) GROUP_OF_TEAM[TEAM_ID[name]] = letter
}

export function teamView(teamId) {
  const t = teamId ? TEAM_BY_ID[teamId] : null
  return { teamId: teamId ?? null, name: t?.name ?? 'TBD', flag: t?.flag ?? '🏳️' }
}

// Top scorer on the champion's own team, by ESPN scoringPlays display name.
// scoringPlays.scorer is a plain display name (not a roster UUID — see
// lib/propLeaders.js), so this is a best-effort tally across every match doc.
function championTopScorer(championId, matches) {
  const tally = {}
  for (const m of matches) {
    for (const play of m.scoringPlays ?? []) {
      if (play.teamId !== championId || !play.scorer) continue
      tally[play.scorer] = (tally[play.scorer] ?? 0) + 1
    }
  }
  let best = null
  for (const [name, goals] of Object.entries(tally)) {
    if (!best || goals > best.goals) best = { name, goals }
  }
  return best
}

// The champion's view of a single fixture: which side they are, the opponent,
// and (once final) the W/L/D outcome. fx is a lib/fixtures.js fixture.
export function championSide(fx, championId) {
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
  let eliminated = false
  let defeatedBy = null
  let eliminatedRound = null
  let wonItAll = false

  for (const m of matches) {
    if (!m.round || m.status?.state !== 'post') continue
    if (!m.competitors?.some((c) => c.teamId === championId)) continue
    if (matchLoser(m) === championId) {
      eliminated = true
      defeatedBy = teamView(matchWinner(m))
      eliminatedRound = ROUND_LABELS[m.round] ?? null
    }
    if (m.round === 'final' && matchWinner(m) === championId) wonItAll = true
  }

  // Group-stage non-advancement: only once the group is fully complete (a
  // structural signal owned by Feature 2's onMatchComplete) and the champion
  // finished outside the qualifying places (top 2, or 3rd if advancing).
  if (!eliminated && !wonItAll) {
    const letter = GROUP_OF_TEAM[championId]
    const g = letter ? groups[letter] : null
    if (g?.complete && Array.isArray(g.entries)) {
      const idx = g.entries.findIndex((e) => e.team?.id === championId)
      const advanced = idx === 0 || idx === 1 || (idx === 2 && advancingLetters.includes(letter))
      if (idx !== -1 && !advanced) {
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
    live: live ? championSide(live, championId) : null,
    lastResult: lastResult ? championSide(lastResult, championId) : null,
    next,
    topScorer: championTopScorer(championId, matches),
  }
}
