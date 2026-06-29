// Builds a unified, date-grouped fixture list for the stadium schedule view
// (FotMob-style date selector). Pure — no Firestore/network — so it can be unit
// tested, mirroring lib/propLeaders.js.
//
// Sources, merged by ESPN event id (highest-priority field wins):
//   - liveData/scoreboard events: today's live score + clock (in-progress).
//   - matches/{eventId} docs: authoritative finished/in-progress result + teams.
//   - liveData/schedule events: the full fixture skeleton for every day
//     (group + knockout, incl. future), written daily by the scheduleSync
//     Cloud Function — teams/date/venue, no scores.
//   - static knockout schedule + bracket derivation: a client-side FALLBACK for
//     future knockout games when the schedule doc isn't available yet.
import { TEAM_BY_ID } from '../data.js'
import {
  ROUND_LABELS, R32_SLOTS, PREV_ROUND, deriveRoundMatchups,
  EVENT_SLOT_MAP, MATCH_SCHEDULE, SLOT_MATCH_NUM, matchWinner, matchLoser,
} from '../bracket.js'

// 'round_slot' → ESPN event id (inverse of EVENT_SLOT_MAP).
const SLOT_EVENT = {}
for (const [id, { round, slot }] of Object.entries(EVENT_SLOT_MAP)) {
  SLOT_EVENT[`${round}_${slot}`] = id
}

function teamView(teamId, fallbackName, score) {
  const known = teamId ? TEAM_BY_ID[teamId] : null
  return {
    teamId: teamId ?? null,
    flag: known?.flag ?? '🏳️',
    name: known?.name ?? fallbackName ?? 'TBD',
    score,
  }
}

function labelFor({ round, group }) {
  if (round) return ROUND_LABELS[round] ?? 'Knockout'
  return group || 'Group Stage'
}

function venueCity(venue) {
  return venue?.city || venue?.address?.city || venue?.fullName || null
}

// YYYY-MM-DD for an ISO timestamp, in US Eastern (the app's display zone).
export function etDayKey(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}


// ── Skeleton builders (one per source) ──────────────────────────────────────
// A skeleton is { id, label, dateISO, venue, state, competitors: [{teamId, name}] }.

function eventSkeleton(ev) {
  return {
    id: String(ev.id),
    label: labelFor(ev),
    dateISO: ev.date ?? null,
    venue: ev.venue ?? null,
    state: ev.status?.state ?? 'pre',
    competitors: (ev.competitors ?? []).map((c) => ({ teamId: c.teamId, name: c.name })),
  }
}

function docSkeleton(m) {
  return {
    id: String(m.id),
    label: labelFor({ round: m.round, group: m.group || (m.groupLetter ? `Group ${m.groupLetter}` : null) }),
    dateISO: m.header?.competitions?.[0]?.date ?? null,
    venue: m.header?.competitions?.[0]?.venue ?? null,
    state: m.status?.state ?? null,
    competitors: (m.competitors ?? []).map((c) => ({ teamId: c.teamId, name: c.name })),
  }
}

// Fallback: derive future knockout fixtures from the static schedule + the
// bracket so they still appear before the schedule doc exists.
function staticKnockoutSkeletons(matches) {
  const docByKey = new Map()
  for (const m of matches) if (m.round && m.slot) docByKey.set(`${m.round}_${m.slot}`, m)

  const decided = { r32: R32_SLOTS.map((teams, i) => ({ teams, winner: matchWinner(docByKey.get(`r32_${i + 1}`)) })) }
  for (const round of ['r16', 'qf', 'sf']) {
    const prev = decided[PREV_ROUND[round]].map((s) => s.winner)
    decided[round] = deriveRoundMatchups(round, prev).map((teams, i) => ({ teams, winner: matchWinner(docByKey.get(`${round}_${i + 1}`)) }))
  }
  decided.final = [{ teams: decided.sf.map((s) => s.winner) }]
  decided.third = [{ teams: decided.sf.map((_, i) => matchLoser(docByKey.get(`sf_${i + 1}`))) }]

  const out = []
  for (const round of ['r32', 'r16', 'qf', 'sf', 'third', 'final']) {
    decided[round].forEach(({ teams }, i) => {
      const slot = i + 1
      const id = SLOT_EVENT[`${round}_${slot}`]
      if (!id) return
      const sched = MATCH_SCHEDULE[SLOT_MATCH_NUM[round]?.[i]]
      out.push({
        id: String(id),
        label: ROUND_LABELS[round],
        dateISO: sched?.date ?? null,
        venue: sched ? { fullName: sched.venue } : null,
        state: 'pre',
        competitors: teams.map((tid) => ({ teamId: tid, name: null })),
      })
    })
  }
  return out
}

function buildFixture(sk, doc, live) {
  const inProgress = live?.status?.state === 'in'
  const state = inProgress ? 'in' : (doc?.status?.state ?? sk.state ?? 'pre')
  const clock = state === 'in'
    ? (live?.status?.displayClock || doc?.status?.displayClock || 'Live')
    : (state === 'post' ? 'FT' : null)
  const scoreSrc = inProgress ? live : (state !== 'pre' ? (doc ?? live) : null)
  const scoreFor = (teamId) =>
    state === 'pre' || teamId == null ? null
      : (scoreSrc?.competitors?.find((c) => c.teamId === teamId)?.score ?? null)

  // Once a doc exists it has the real teams in the right home/away order.
  const comps = doc?.competitors?.length
    ? doc.competitors.map((c) => ({ teamId: c.teamId, name: c.name }))
    : sk.competitors
  const dateISO = doc?.header?.competitions?.[0]?.date ?? sk.dateISO ?? null
  const venue = doc?.header?.competitions?.[0]?.venue ?? sk.venue ?? null

  return {
    id: sk.id,
    label: sk.label,
    state,
    clock,
    dateISO,
    dayKey: dateISO ? etDayKey(dateISO) : null,
    venue: venueCity(venue),
    teams: comps.map((c) => teamView(c.teamId, c.name, scoreFor(c.teamId))),
  }
}

export function buildFixtures(matches = [], scoreboardEvents = [], scheduleEvents = []) {
  const sbById = new Map(scoreboardEvents.map((e) => [String(e.id), e]))
  const docById = new Map(matches.map((m) => [String(m.id), m]))

  // Skeletons by id, in priority order — first writer wins.
  const skById = new Map()
  for (const ev of scheduleEvents) skById.set(String(ev.id), eventSkeleton(ev))
  for (const k of staticKnockoutSkeletons(matches)) if (!skById.has(k.id)) skById.set(k.id, k)
  for (const m of matches) if (!skById.has(String(m.id))) skById.set(String(m.id), docSkeleton(m))
  for (const ev of scoreboardEvents) if (!skById.has(String(ev.id))) skById.set(String(ev.id), eventSkeleton(ev))

  const out = []
  for (const [id, sk] of skById) out.push(buildFixture(sk, docById.get(id), sbById.get(id)))
  return out
    .filter((f) => f.dateISO)
    .sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO))
}

// Distinct day keys (YYYY-MM-DD, ET) present in the fixtures, in order.
export function fixtureDays(fixtures) {
  const seen = new Set()
  const days = []
  for (const f of fixtures) {
    if (f.dayKey && !seen.has(f.dayKey)) {
      seen.add(f.dayKey)
      days.push(f.dayKey)
    }
  }
  return days
}
