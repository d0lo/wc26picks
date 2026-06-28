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

function mostGroupGoalsLeaders(matches) {
  const byTeam = {}
  for (const m of matches.filter(isGroupMatch)) {
    for (const play of m.scoringPlays ?? []) {
      if (!play.teamId) continue
      byTeam[play.teamId] = (byTeam[play.teamId] ?? 0) + 1
    }
  }
  return Object.entries(byTeam)
    .map(([teamId, goals]) => ({ teamId, goals }))
    .sort((a, b) => b.goals - a.goals)
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

// "Clean sheet in all 3 group games" — ranked by clean sheets earned so far
// out of group games played, since the group stage may not be finished yet.
function cleanGroupTeamLeaders(matches) {
  const byTeam = {}
  for (const m of matches.filter(isGroupMatch)) {
    if (m.status?.state !== 'post') continue
    for (const c of m.competitors ?? []) {
      const opponent = (m.competitors ?? []).find((o) => o.teamId !== c.teamId)
      byTeam[c.teamId] ??= { teamId: c.teamId, played: 0, cleanSheets: 0 }
      byTeam[c.teamId].played += 1
      if ((opponent?.score ?? null) === 0) byTeam[c.teamId].cleanSheets += 1
    }
  }
  return Object.values(byTeam).sort(
    (a, b) => b.cleanSheets - a.cleanSheets || b.played - a.played
  )
}

// Keyed by config/public.scoring.props[].key (see scripts/seed-scoring-config.mjs).
// Any prop key not listed here — goldenGlove, goldenBall, youngPlayer,
// breakoutPlayer, mostAssists, mostYellowCards — is structurally
// non-computable from currently tracked data.
const RESOLVERS = {
  goldenBoot: goldenBootLeaders,
  mostGroupGoals: mostGroupGoalsLeaders,
  hatTrickScorer: hatTrickScorers,
  cleanGroupTeam: cleanGroupTeamLeaders,
}

export function resolvePropLeaders(propKey, matches) {
  const resolver = RESOLVERS[propKey]
  if (!resolver) return { computable: false, leaders: [] }
  return { computable: true, leaders: resolver(matches ?? []) }
}
