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

// "Most Goals in Tournament" — counts every goal across all matches (group
// stage and knockout), not just group-stage games. Full standings sorted by
// goals desc; the view shows the top 5 and ranks ties golf-style.
function mostGoalsLeaders(matches) {
  const byTeam = {}
  for (const m of matches) {
    for (const play of m.scoringPlays ?? []) {
      if (!play.teamId) continue
      byTeam[play.teamId] = (byTeam[play.teamId] ?? 0) + 1
    }
  }
  return Object.entries(byTeam)
    .map(([teamId, goals]) => ({ teamId, goals }))
    .sort((a, b) => b.goals - a.goals)
}

// "Most Assists" — sums each player's per-match `goalAssists` roster stat
// (newly persisted in matches/{id}.rosters[].players[].stats) across all
// matches. Full standings sorted desc; the view shows the top 5.
function mostAssistsLeaders(matches) {
  const byPlayer = {}
  for (const m of matches) {
    for (const side of m.rosters ?? []) {
      for (const p of side.players ?? []) {
        const a = Number(p.stats?.goalAssists)
        if (!Number.isFinite(a) || a <= 0) continue
        const key = p.playerId ?? `${p.name}|${side.teamId}`
        byPlayer[key] ??= { scorer: p.name, teamId: side.teamId, assists: 0 }
        byPlayer[key].assists += a
      }
    }
  }
  return Object.values(byPlayer).sort((a, b) => b.assists - a.assists)
}

// "Golden Glove" (unofficial) — the real award is committee-voted, but we can
// approximate from goalkeeper stats: total saves and clean sheets (matches the
// keeper played and personally conceded 0). Only counts keepers (position "G")
// in matches they actually appeared in, so a benched backup isn't credited a
// clean sheet. Ranked by clean sheets, then saves.
function goldenGloveLeaders(matches) {
  const byKeeper = {}
  for (const m of matches) {
    for (const side of m.rosters ?? []) {
      for (const p of side.players ?? []) {
        if (p.position !== 'G') continue
        const appeared = p.starter || Number(p.stats?.appearances) > 0
        if (!appeared) continue
        const key = p.playerId ?? `${p.name}|${side.teamId}`
        byKeeper[key] ??= { scorer: p.name, teamId: side.teamId, saves: 0, cleanSheets: 0 }
        byKeeper[key].saves += Number(p.stats?.saves) || 0
        if (Number(p.stats?.goalsConceded) === 0) byKeeper[key].cleanSheets += 1
      }
    }
  }
  return Object.values(byKeeper).sort(
    (a, b) => b.cleanSheets - a.cleanSheets || b.saves - a.saves
  )
}

// "Team with Most Yellow Cards" — sums the per-match `yellowCards` team stat
// (already persisted in matches/{id}.teamStats from the ESPN boxscore) across
// every match. Full standings sorted desc; the view shows the top 5.
function mostYellowCardsLeaders(matches) {
  const byTeam = {}
  for (const m of matches) {
    for (const ts of m.teamStats ?? []) {
      const stat = (ts.stats ?? []).find((s) => s.name === 'yellowCards')
      const n = Number(stat?.displayValue)
      if (!ts.teamId || !Number.isFinite(n)) continue
      byTeam[ts.teamId] = (byTeam[ts.teamId] ?? 0) + n
    }
  }
  return Object.entries(byTeam)
    .map(([teamId, cards]) => ({ teamId, cards }))
    .sort((a, b) => b.cards - a.cards)
}

// One row per player who scored a hat trick, carrying the team(s) they scored
// it against (a player can manage more than one across the tournament) rather
// than a goal count — the view renders the opponent(s), not the tally.
function hatTrickScorers(matches) {
  // First tally goals per (match, scorer); 3+ in a single game is a hat trick.
  const byMatchScorer = {}
  for (const m of matches) {
    for (const play of m.scoringPlays ?? []) {
      if (!play.scorer) continue
      const key = `${m.eventId ?? m.id}|${play.scorer}|${play.teamId ?? ''}`
      byMatchScorer[key] ??= { match: m, scorer: play.scorer, teamId: play.teamId ?? null, goals: 0 }
      byMatchScorer[key].goals += 1
    }
  }
  // Collapse to one row per player, collecting the opponent of each hat-trick game.
  const byScorer = {}
  for (const h of Object.values(byMatchScorer)) {
    if (h.goals < 3) continue
    const opponent = (h.match.competitors ?? []).find((c) => c.teamId !== h.teamId)
    const key = `${h.scorer}|${h.teamId ?? ''}`
    byScorer[key] ??= { scorer: h.scorer, teamId: h.teamId, opponents: [] }
    byScorer[key].opponents.push(opponent?.teamId ?? null)
  }
  return Object.values(byScorer)
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
      byTeam[c.teamId] ??= { teamId: c.teamId, group: m.groupLetter, played: 0, goalsAgainst: 0 }
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
// Any prop key not listed here — goldenBall, youngPlayer, breakoutPlayer — is
// structurally non-computable from currently tracked data (subjective awards).
//
// `ranked` props show a standings list capped at `limit`, ranked by `metric`
// (the numeric field on each leader) with `unit` as the displayed noun; ties
// are shown golf-style by the view. Unranked props show every entry the
// resolver returns (already pre-filtered to the leading set), no rank numbers.
const RESOLVERS = {
  goldenBoot: { resolve: goldenBootLeaders, ranked: true, limit: 5, metric: 'goals', unit: 'goal' },
  // Ranked by clean sheets; the view shows both saves and clean sheets, and
  // flags it "*Unofficial" since the real Golden Glove is a committee award.
  goldenGlove: { resolve: goldenGloveLeaders, ranked: true, limit: 5, metric: 'cleanSheets', unit: 'clean sheet' },
  // Key predates the group→tournament prop rename; it now means "most goals in
  // the tournament" and resolves goals across all matches (see mostGoalsLeaders).
  // Kept as a stable internal handle — picks key off `id`, not this string.
  mostGroupGoals: { resolve: mostGoalsLeaders, ranked: true, limit: 5, metric: 'goals', unit: 'goal' },
  mostYellowCards: { resolve: mostYellowCardsLeaders, ranked: true, limit: 5, metric: 'cards', unit: 'card' },
  mostAssists: { resolve: mostAssistsLeaders, ranked: true, limit: 5, metric: 'assists', unit: 'assist' },
  hatTrickScorer: { resolve: hatTrickScorers, ranked: false },
  cleanGroupTeam: { resolve: cleanGroupTeamLeaders, ranked: false },
}

export function resolvePropLeaders(propKey, matches) {
  const entry = RESOLVERS[propKey]
  if (!entry) return { computable: false, leaders: [], ranked: false, limit: 0 }
  const leaders = entry.resolve(matches ?? [])
  return {
    computable: true,
    leaders,
    ranked: entry.ranked,
    limit: entry.limit ?? leaders.length,
    metric: entry.metric,
    unit: entry.unit,
  }
}
