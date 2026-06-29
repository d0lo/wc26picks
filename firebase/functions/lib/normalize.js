import { resolveTeam } from './teams.js'
import { EVENT_SLOT_MAP } from './bracket.js'

function fallbackTeam(team) {
  return { id: String(team?.id ?? ''), name: team?.displayName ?? 'Unknown', abbreviation: team?.abbreviation ?? '', logo: team?.logo ?? null }
}

function normalizeCompetitor(competitor) {
  const resolved = resolveTeam(competitor.team?.id) ?? fallbackTeam(competitor.team)
  return {
    teamId: resolved.id,
    name: resolved.name,
    abbreviation: resolved.abbreviation,
    logo: competitor.team?.logo ?? resolved.logo ?? null,
    score: competitor.score ?? null,
    homeAway: competitor.homeAway,
    // Penalty-shootout draws end level on score alone, so the winner can't
    // always be inferred by comparing competitors' scores — ESPN's own
    // `winner` flag is the only reliable signal once a knockout match ends.
    winner: !!competitor.winner,
  }
}

// Knockout matches are keyed by a fixed { round, slot } from EVENT_SLOT_MAP
// (see lib/bracket.js) rather than a group letter — null for group-stage
// events, which use parseGroupLetter instead.
export function knockoutRoundSlot(eventId) {
  return EVENT_SLOT_MAP[Number(eventId)] ?? null
}

export function parseGroupLetter(altGameNote) {
  const match = /Group\s+([A-L])\b/i.exec(altGameNote || '')
  return match ? match[1].toUpperCase() : null
}

// Maps a raw ESPN /scoreboard event into the EventSummary shape stored in
// liveData/scoreboard.events[].
export function normalizeEvent(event) {
  const comp = event.competitions[0]
  const letter = parseGroupLetter(comp.altGameNote)
  const roundSlot = knockoutRoundSlot(event.id)
  return {
    id: event.id,
    date: event.date,
    name: event.name,
    shortName: event.shortName,
    status: {
      state: comp.status.type.state,
      displayClock: comp.status.displayClock,
      period: comp.status.period ?? null,
      description: comp.status.type.description,
      detail: comp.status.type.detail,
    },
    competitors: comp.competitors.map(normalizeCompetitor),
    venue: {
      fullName: comp.venue?.fullName ?? null,
      city: comp.venue?.address?.city ?? null,
      country: comp.venue?.address?.country ?? null,
    },
    group: letter ? `Group ${letter}` : null,
    round: roundSlot?.round ?? null,
    slot: roundSlot?.slot ?? null,
  }
}

function normalizeStandingEntry(entry) {
  const resolved = resolveTeam(entry.id) ?? { id: String(entry.id), name: entry.team, abbreviation: '', logo: null }
  const stat = (name) => entry.stats?.find((s) => s.name === name)?.value ?? null
  return {
    team: { id: resolved.id, name: resolved.name, abbreviation: resolved.abbreviation, logo: resolved.logo },
    gamesPlayed: stat('gamesPlayed'),
    wins: stat('wins'),
    losses: stat('losses'),
    ties: stat('ties'),
    // ESPN's World Cup standings table doesn't expose goalsFor/goalsAgainst
    // separately — only the net goal differential.
    goalsFor: null,
    goalsAgainst: null,
    goalDiff: stat('pointDifferential'),
    points: stat('points'),
  }
}

// Maps an ESPN /summary response into the matches/{eventId} doc
// (eventId, fetchedAt added by the caller, which owns the Firestore timestamp).
export function normalizeMatch(summary) {
  const comp = summary.header.competitions[0]
  const competitors = comp.competitors.map(normalizeCompetitor)

  const teamScoreAt = (() => {
    const running = {}
    for (const c of competitors) running[c.teamId] = 0
    return running
  })()

  const scoringPlays = (summary.keyEvents || [])
    .filter((e) => e.scoringPlay)
    .map((e) => {
      const resolved = resolveTeam(e.team?.id)
      const teamId = resolved?.id ?? null
      if (teamId && teamId in teamScoreAt) teamScoreAt[teamId] += 1
      return {
        id: e.id,
        teamId,
        scorer: e.participants?.[0]?.athlete?.displayName ?? null,
        minute: e.clock?.displayValue ?? null,
        period: e.period?.number ?? null,
        text: e.shortText ?? e.text ?? null,
        runningScore: { ...teamScoreAt },
      }
    })

  // Firestore arrays can't directly contain other arrays, so each side is
  // wrapped in a map. Keyed by teamId (resolved the same way as competitors)
  // rather than homeAway, so consumers never need to join through
  // `competitors` just to find out which team a roster/stat-line belongs to.
  const rosters = (summary.rosters || []).map((side) => ({
    teamId: (resolveTeam(side.team?.id) ?? fallbackTeam(side.team)).id,
    players: (side.roster || []).map((p) => ({
      playerId: p.athlete?.id ?? null,
      name: p.athlete?.displayName ?? null,
      starter: !!p.starter,
      position: p.position?.abbreviation ?? null,
      jersey: p.jersey ?? null,
    })),
  }))

  const teamStats = (summary.boxscore?.teams || []).map((t) => ({
    teamId: (resolveTeam(t.team?.id) ?? fallbackTeam(t.team)).id,
    stats: (t.statistics || []).map((s) => ({
      name: s.name,
      label: s.label,
      displayValue: s.displayValue,
    })),
  }))

  const groupStandings = (summary.standings?.groups?.[0]?.standings?.entries || []).map(normalizeStandingEntry)

  return {
    header: summary.header,
    competitors,
    scoringPlays,
    rosters,
    teamStats,
    groupStandings,
    status: {
      state: comp.status.type.state,
      description: comp.status.type.description,
    },
  }
}
