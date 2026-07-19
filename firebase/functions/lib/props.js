// Pure prop-winner resolution for the auto-scoring engine — no Firestore/ESPN
// dependencies, so it can be unit tested in isolation from the triggers.
//
// Mirrors the display-only leaderboards in app/src/lib/propLeaders.js, but
// resolves *winners* (the leading set, golf-style: every entry tied at the
// top counts) rather than full standings, and maps player display names to
// the stable roster UUIDs picks are keyed by. Winners are live-incremental,
// like group scores: the current leader is the current winner, recomputed
// idempotently after every match — not gated on the tournament finishing.
// The admin can always override any prop's winners manually (see
// computePropResults), which is also the only way to grade props that
// aren't derivable from match data (goldenGlove, goldenBall, youngPlayer,
// breakoutPlayer — subjective/committee awards).

// ── Player-name → roster-UUID matching ─────────────────────────────────────
// ESPN match data carries plain display names ("Kylian Mbappé"); picks store
// our stable roster UUIDs (app/src/rosters.js, mirrored in the players/
// Firestore collection). Names are matched within the player's team first
// (normalized exact, then word-order-insensitive, then unique last name),
// falling back to a globally-unique exact name. Anything that still doesn't
// match is surfaced as `unmatched` so the admin screen can show that manual
// grading is needed rather than silently never crediting the pick.

export function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function wordKey(normalized) {
  return normalized.split(' ').sort().join(' ')
}

function push(map, key, value) {
  if (!key) return
  if (!map.has(key)) map.set(key, [])
  map.get(key).push(value)
}

// players: [{ id, name, teamId }] — the seeded players/ collection.
export function buildPlayerIndex(players) {
  const byTeamExact = new Map()
  const byTeamWords = new Map()
  const byTeamLast = new Map()
  const byGlobalExact = new Map()
  for (const p of players ?? []) {
    const norm = normalizeName(p.name)
    if (!norm || !p.id) continue
    push(byTeamExact, `${p.teamId}|${norm}`, p)
    push(byTeamWords, `${p.teamId}|${wordKey(norm)}`, p)
    push(byTeamLast, `${p.teamId}|${norm.split(' ').pop()}`, p)
    push(byGlobalExact, norm, p)
  }
  return { byTeamExact, byTeamWords, byTeamLast, byGlobalExact }
}

function uniqueId(candidates) {
  if (!candidates) return null
  const ids = [...new Set(candidates.map((p) => p.id))]
  return ids.length === 1 ? ids[0] : null
}

export function matchPlayerId(index, name, teamId) {
  const norm = normalizeName(name)
  if (!norm) return null
  return (
    uniqueId(index.byTeamExact.get(`${teamId}|${norm}`)) ??
    uniqueId(index.byTeamWords.get(`${teamId}|${wordKey(norm)}`)) ??
    uniqueId(index.byTeamLast.get(`${teamId}|${norm.split(' ').pop()}`)) ??
    uniqueId(index.byGlobalExact.get(norm))
  )
}

// ── Auto resolvers ─────────────────────────────────────────────────────────
// Each returns the leading set only. Player resolvers return
// [{ name, teamId }] (mapped to roster UUIDs by computePropResults); team
// resolvers return [teamId]. Tallying logic deliberately mirrors
// app/src/lib/propLeaders.js so the prop leaderboards users watch and the
// winners that score points can't drift apart.

function leaders(entries, metric) {
  const max = Math.max(0, ...entries.map((e) => e[metric]))
  return max > 0 ? entries.filter((e) => e[metric] === max) : []
}

// Penalty-shootout kicks arrive as scoringPlays too (period 5) but aren't
// goals — they'd inflate every goal tally the moment a knockout match goes
// to penalties. Excluded from BOTH player and team tallies.
export function isShootoutPlay(play) {
  return play.period === 5
}

// Own goals credit the BENEFITING team (so they count for team goal
// tallies) but never the player who scored them — FIFA excludes own goals
// from the Golden Boot. ESPN doesn't flag them structurally in our stored
// shape, so this is a best-effort text match; anything it misses is fixable
// via the admin manual override.
export function isOwnGoalPlay(play) {
  return /own[\s-]?goal/i.test(play.text ?? '')
}

function countsForPlayerGoals(play) {
  return !!play.scorer && !isShootoutPlay(play) && !isOwnGoalPlay(play)
}

function goldenBootWinners(matches) {
  const byScorer = {}
  for (const m of matches) {
    for (const play of m.scoringPlays ?? []) {
      if (!countsForPlayerGoals(play)) continue
      const key = `${play.scorer}|${play.teamId ?? ''}`
      byScorer[key] ??= { name: play.scorer, teamId: play.teamId ?? null, goals: 0 }
      byScorer[key].goals += 1
    }
  }
  return leaders(Object.values(byScorer), 'goals')
}

function mostAssistsWinners(matches) {
  const byPlayer = {}
  for (const m of matches) {
    for (const side of m.rosters ?? []) {
      for (const p of side.players ?? []) {
        const a = Number(p.stats?.goalAssists)
        if (!Number.isFinite(a) || a <= 0) continue
        const key = p.playerId ?? `${p.name}|${side.teamId}`
        byPlayer[key] ??= { name: p.name, teamId: side.teamId, assists: 0 }
        byPlayer[key].assists += a
      }
    }
  }
  return leaders(Object.values(byPlayer), 'assists')
}

// Every player with 3+ goals in a single match wins — this isn't a leaders
// race, any hat trick at all satisfies the pick.
function hatTrickWinners(matches) {
  const byMatchScorer = {}
  for (const m of matches) {
    for (const play of m.scoringPlays ?? []) {
      if (!countsForPlayerGoals(play)) continue
      // Falls back to the Firestore doc id (mirroring propLeaders.js's
      // m.eventId ?? m.id) so a doc missing the eventId field can't collapse
      // two matches into one bucket and mint a phantom hat trick.
      const key = `${m.eventId ?? m.id ?? ''}|${play.scorer}|${play.teamId ?? ''}`
      byMatchScorer[key] ??= { name: play.scorer, teamId: play.teamId ?? null, goals: 0 }
      byMatchScorer[key].goals += 1
    }
  }
  const seen = new Set()
  const winners = []
  for (const h of Object.values(byMatchScorer)) {
    if (h.goals < 3) continue
    const key = `${h.name}|${h.teamId ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    winners.push({ name: h.name, teamId: h.teamId })
  }
  return winners
}

// "Most Goals in Tournament" — every goal across all matches, group stage
// and knockout alike (the key predates the group→tournament rename).
function mostGoalsTeamWinners(matches) {
  const byTeam = {}
  for (const m of matches) {
    for (const play of m.scoringPlays ?? []) {
      if (!play.teamId || isShootoutPlay(play)) continue
      byTeam[play.teamId] = (byTeam[play.teamId] ?? 0) + 1
    }
  }
  return leaders(
    Object.entries(byTeam).map(([teamId, goals]) => ({ teamId, goals })),
    'goals'
  ).map((t) => t.teamId)
}

function mostYellowCardsTeamWinners(matches) {
  const byTeam = {}
  for (const m of matches) {
    for (const ts of m.teamStats ?? []) {
      const stat = (ts.stats ?? []).find((s) => s.name === 'yellowCards')
      const n = Number(stat?.displayValue)
      if (!ts.teamId || !Number.isFinite(n)) continue
      byTeam[ts.teamId] = (byTeam[ts.teamId] ?? 0) + n
    }
  }
  return leaders(
    Object.entries(byTeam).map(([teamId, cards]) => ({ teamId, cards })),
    'cards'
  ).map((t) => t.teamId)
}

// A winner must have finished all 3 group games conceding 0 — a definitive
// achievement regardless of other groups still playing. Unlike the display
// leaderboard (which shows teams merely still on track), a team with games
// left can't be credited yet.
function cleanGroupTeamWinners(matches) {
  const byTeam = {}
  for (const m of matches) {
    if (!m.groupLetter || m.status?.state !== 'post') continue
    for (const c of m.competitors ?? []) {
      const opponent = (m.competitors ?? []).find((o) => o.teamId !== c.teamId)
      byTeam[c.teamId] ??= { teamId: c.teamId, played: 0, goalsAgainst: 0 }
      byTeam[c.teamId].played += 1
      // A missing opponent score is unknowable — fold in Infinity rather than
      // reading null as 0, dropping the team instead of falsely crediting it.
      const oppScore = opponent?.score
      byTeam[c.teamId].goalsAgainst += oppScore == null ? Infinity : Number(oppScore)
    }
  }
  return Object.values(byTeam)
    .filter((t) => t.played === 3 && t.goalsAgainst === 0)
    .map((t) => t.teamId)
}

// Keyed by config/public.scoring.props[].key. Any key not listed here is
// structurally non-computable from tracked data (subjective awards —
// goldenGlove is deliberately excluded too: the real award is
// committee-voted, so its unofficial saves/clean-sheets approximation is
// display-only and must not award points). Those props score only via a
// manual admin-entered result.
const AUTO_RESOLVERS = {
  goldenBoot: { kind: 'player', resolve: goldenBootWinners },
  mostAssists: { kind: 'player', resolve: mostAssistsWinners },
  hatTrickScorer: { kind: 'player', resolve: hatTrickWinners },
  mostGroupGoals: { kind: 'team', resolve: mostGoalsTeamWinners },
  mostYellowCards: { kind: 'team', resolve: mostYellowCardsTeamWinners },
  // "No Team" (a null pick) can only win once the group stage is complete
  // and nobody kept all 3 clean sheets — before that the outcome is open.
  cleanGroupTeam: { kind: 'team', resolve: cleanGroupTeamWinners, noneWhenComplete: true },
}

// The full liveData/propResults.results map: { [propId]: entry } where entry
// is { winners: string[], source: 'auto'|'manual', noWinner?: true,
// unmatched?: string[] }. Winners are pick-comparable ids (roster player
// UUIDs / team UUIDs). A prop with nothing decidable yet gets NO entry —
// consumers treat absence (or an empty-winners entry without noWinner) as
// "pending", never as "everyone is wrong".
//
// Precedence per prop: admin override (config/propResults.overrides) →
// auto resolver (unless the catalog flags the prop `manual`) → nothing.
export function computePropResults({ catalog, matches, playerIndex, groupsComplete, overrides }) {
  const results = {}
  for (const prop of catalog ?? []) {
    if (prop.archived) continue

    const override = overrides?.[prop.id]
    if (override && (override.noWinner || override.winners?.length)) {
      results[prop.id] = {
        source: 'manual',
        winners: override.noWinner ? [] : [...new Set(override.winners)],
        ...(override.noWinner ? { noWinner: true } : {}),
      }
      continue
    }

    const resolver = prop.manual ? null : AUTO_RESOLVERS[prop.key]
    if (!resolver) continue

    const leading = resolver.resolve(matches ?? [])
    let winners
    const unmatched = []
    if (resolver.kind === 'player') {
      winners = []
      for (const l of leading) {
        const id = matchPlayerId(playerIndex, l.name, l.teamId)
        if (id) winners.push(id)
        else unmatched.push(l.name)
      }
      winners = [...new Set(winners)]
    } else {
      winners = leading
    }

    const noWinner = !!(resolver.noneWhenComplete && groupsComplete && winners.length === 0 && unmatched.length === 0)
    if (!winners.length && !noWinner && !unmatched.length) continue
    results[prop.id] = {
      source: 'auto',
      winners,
      ...(noWinner ? { noWinner: true } : {}),
      ...(unmatched.length ? { unmatched } : {}),
    }
  }
  return results
}
