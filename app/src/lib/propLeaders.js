// Best-effort "current state" leaderboards for props that are structurally
// derivable from matches/* data already replicated client-side (scoringPlays,
// competitors, groupLetter). Props whose underlying stat isn't tracked
// anywhere — saves, assists, subjective awards, per-team card counts — are
// marked non-computable rather than guessing at an ESPN field and silently
// showing a wrong (e.g. always-zero) value forever.
//
// These leaderboards are display-only: scoringPlays.scorer is a plain ESPN
// display name, not linked to the stable roster player UUIDs picks are keyed
// by, so there's no way to mark a user's own pick "correct" here — see
// PicksSummary.vue, which intentionally leaves the Props section unstyled.

const isGroupMatch = (m) => !!m.groupLetter

function goldenBootLeaders(matches) {
  const byScorer = {}
  for (const m of matches) {
    for (const play of m.scoringPlays ?? []) {
      if (!play.scorer) continue
      const key = `${play.scorer}|${play.teamId ?? ''}`
      byScorer[key] ??= { scorer: play.scorer, teamId: play.teamId ?? null, goals: 0 }
      byScorer[key].goals += 1
    }
  }
  return Object.values(byScorer).sort((a, b) => b.goals - a.goals)
}

// "Most goals in the group stage" — only the teams tied for the lead, no
// full standings. Recomputed live, so the leading set grows/shrinks as
// results come in; once the stage is over it's the final co-leaders.
function mostGroupGoalsLeaders(matches) {
  const byTeam = {}
  for (const m of matches.filter(isGroupMatch)) {
    for (const play of m.scoringPlays ?? []) {
      if (!play.teamId) continue
      byTeam[play.teamId] = (byTeam[play.teamId] ?? 0) + 1
    }
  }
  const teams = Object.entries(byTeam).map(([teamId, goals]) => ({ teamId, goals }))
  const max = teams.reduce((acc, t) => Math.max(acc, t.goals), 0)
  if (max === 0) return []
  return teams.filter((t) => t.goals === max)
}

function hatTrickScorers(matches) {
  const byMatchScorer = {}
  for (const m of matches) {
    for (const play of m.scoringPlays ?? []) {
      if (!play.scorer) continue
      const key = `${m.eventId ?? m.id}|${play.scorer}|${play.teamId ?? ''}`
      byMatchScorer[key] ??= { scorer: play.scorer, teamId: play.teamId ?? null, goals: 0 }
      byMatchScorer[key].goals += 1
    }
  }
  return Object.values(byMatchScorer)
    .filter((s) => s.goals >= 3)
    .sort((a, b) => b.goals - a.goals)
}

// "Clean sheet in all 3 group games" — every team that has conceded 0 goals
// across the group games it has played so far, no standings. While the stage
// is in progress these are the teams still on track; once all 3 are played it
// resolves to the teams that kept a clean sheet the entire group stage.
function cleanGroupTeamLeaders(matches) {
  const byTeam = {}
  for (const m of matches.filter(isGroupMatch)) {
    if (m.status?.state !== 'post') continue
    for (const c of m.competitors ?? []) {
      const opponent = (m.competitors ?? []).find((o) => o.teamId !== c.teamId)
      byTeam[c.teamId] ??= { teamId: c.teamId, played: 0, goalsAgainst: 0 }
      byTeam[c.teamId].played += 1
      // ESPN scores are strings ('0','1',…); coerce before summing. A missing
      // opponent score is unknowable, so fold in Infinity rather than reading
      // null as 0 — that drops the team from the conceded-nothing set instead
      // of falsely crediting it with a clean sheet.
      const oppScore = opponent?.score
      byTeam[c.teamId].goalsAgainst += oppScore == null ? Infinity : Number(oppScore)
    }
  }
  return Object.values(byTeam).filter((t) => t.played >= 1 && t.goalsAgainst === 0)
}

// Keyed by config/public.scoring.props[].key (see scripts/seed-scoring-config.mjs).
// Any prop key not listed here — goldenGlove, goldenBall, youngPlayer,
// breakoutPlayer, mostAssists, mostYellowCards — is structurally
// non-computable from currently tracked data.
//
// `ranked` props show a numbered podium capped at `limit`; unranked props show
// every entry the resolver returns (already pre-filtered to the leading set)
// with no rank numbers — "all the teams that lead", not a standings table.
const RESOLVERS = {
  goldenBoot: { resolve: goldenBootLeaders, ranked: true, limit: 5 },
  mostGroupGoals: { resolve: mostGroupGoalsLeaders, ranked: false },
  hatTrickScorer: { resolve: hatTrickScorers, ranked: true, limit: 3 },
  cleanGroupTeam: { resolve: cleanGroupTeamLeaders, ranked: false },
}

export function resolvePropLeaders(propKey, matches) {
  const entry = RESOLVERS[propKey]
  if (!entry) return { computable: false, leaders: [], ranked: false, limit: 0 }
  const leaders = entry.resolve(matches ?? [])
  return { computable: true, leaders, ranked: entry.ranked, limit: entry.limit ?? leaders.length }
}
