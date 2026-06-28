// Builds a unified, date-grouped fixture list for the stadium schedule view
// (FotMob-style date selector). Pure — no Firestore/network — so it can be unit
// tested, mirroring lib/propLeaders.js.
//
// Sources, merged by ESPN event id:
//   - matches/{eventId} docs: every game that has kicked off or finished
//     (group stage + knockout) with real teams, scores and final status.
//   - the static knockout schedule (MATCH_SCHEDULE) + bracket derivation: every
//     remaining knockout game, dated, with teams filled in as the bracket
//     decides them (TBD until both feeders finish).
//   - today's liveData/scoreboard events: live score + clock overlaid on
//     whichever fixture is in progress right now.
import { TEAM_BY_ID } from '../data.js'
import {
  ROUND_LABELS, R32_SLOTS, PREV_ROUND, deriveRoundMatchups,
  EVENT_SLOT_MAP, MATCH_SCHEDULE, SLOT_MATCH_NUM,
} from '../bracket.js'

// 'round_slot' → ESPN event id (inverse of EVENT_SLOT_MAP).
const SLOT_EVENT = {}
for (const [id, { round, slot }] of Object.entries(EVENT_SLOT_MAP)) {
  SLOT_EVENT[`${round}_${slot}`] = id
}

function teamDisplay(teamId) {
  const known = teamId ? TEAM_BY_ID[teamId] : null
  return { teamId: teamId ?? null, flag: known?.flag ?? '🏳️', name: known?.name ?? (teamId ? teamId : 'TBD') }
}

function winnerOf(doc) {
  if (!doc || doc.status?.state !== 'post') return null
  const flagged = doc.competitors?.find((c) => c.winner)
  if (flagged) return flagged.teamId
  const [a, b] = doc.competitors ?? []
  if (!a || !b || a.score == null || b.score == null || a.score === b.score) return null
  return Number(a.score) > Number(b.score) ? a.teamId : b.teamId
}
function loserOf(doc) {
  const w = winnerOf(doc)
  if (!w) return null
  return doc.competitors?.find((c) => c.teamId !== w)?.teamId ?? null
}

// YYYY-MM-DD for an ISO timestamp, in US Eastern (the app's display zone).
export function etDayKey(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function venueCity(venue) {
  return venue?.address?.city || venue?.fullName || null
}

// Merge a static/derived fixture with its matches/* doc and live event into the
// shape the UI renders.
function normalize({ id, label, teamIds, dateISO, venue, doc, live }) {
  const inProgress = live?.status?.state === 'in'
  const state = inProgress ? 'in' : (doc?.status?.state ?? live?.status?.state ?? 'pre')
  const clock = state === 'in'
    ? (live?.status?.displayClock || doc?.status?.displayClock || 'Live')
    : (state === 'post' ? 'FT' : null)
  const scoreSrc = inProgress ? live : (state !== 'pre' ? (doc ?? live) : null)
  const scoreFor = (teamId) =>
    state === 'pre' || teamId == null ? null
      : (scoreSrc?.competitors?.find((c) => c.teamId === teamId)?.score ?? null)

  return {
    id: String(id),
    label,
    state,
    clock,
    dateISO: dateISO ?? null,
    dayKey: dateISO ? etDayKey(dateISO) : null,
    venue: venueCity(venue),
    teams: teamIds.map((tid) => ({ ...teamDisplay(tid), score: scoreFor(tid) })),
  }
}

function groupLabel(doc) {
  return doc.group || (doc.groupLetter ? `Group ${doc.groupLetter}` : 'Group Stage')
}

export function buildFixtures(matches = [], scoreboardEvents = []) {
  const sbById = new Map(scoreboardEvents.map((e) => [String(e.id), e]))
  const knockoutDocByKey = new Map()
  for (const m of matches) {
    if (m.round && m.slot) knockoutDocByKey.set(`${m.round}_${m.slot}`, m)
  }

  const fixtures = []

  // Group-stage / untagged games come straight from their match docs.
  for (const m of matches) {
    if (m.round) continue
    fixtures.push(normalize({
      id: m.id,
      label: groupLabel(m),
      teamIds: (m.competitors ?? []).map((c) => c.teamId),
      dateISO: m.header?.competitions?.[0]?.date,
      venue: m.header?.competitions?.[0]?.venue,
      doc: m,
      live: sbById.get(String(m.id)),
    }))
  }

  // Knockout games — teams derived from the bracket so future rounds appear
  // (TBD until decided), dated from the static schedule when no doc exists yet.
  const decided = { r32: R32_SLOTS.map((teams, i) => ({ teams, winner: winnerOf(knockoutDocByKey.get(`r32_${i + 1}`)) })) }
  for (const round of ['r16', 'qf', 'sf']) {
    const prevWinners = decided[PREV_ROUND[round]].map((s) => s.winner)
    decided[round] = deriveRoundMatchups(round, prevWinners).map((teams, i) => ({ teams, winner: winnerOf(knockoutDocByKey.get(`${round}_${i + 1}`)) }))
  }
  decided.final = [{ teams: decided.sf.map((s) => s.winner) }]
  decided.third = [{ teams: decided.sf.map((_, i) => loserOf(knockoutDocByKey.get(`sf_${i + 1}`))) }]

  for (const round of ['r32', 'r16', 'qf', 'sf', 'third', 'final']) {
    decided[round].forEach(({ teams }, i) => {
      const slot = i + 1
      const doc = knockoutDocByKey.get(`${round}_${slot}`)
      const id = SLOT_EVENT[`${round}_${slot}`]
      const matchNum = SLOT_MATCH_NUM[round]?.[i]
      const sched = MATCH_SCHEDULE[matchNum]
      // Prefer the doc's real competitors (with correct home/away order) once
      // it exists; otherwise the derived teams.
      const teamIds = doc?.competitors?.length ? doc.competitors.map((c) => c.teamId) : teams
      fixtures.push(normalize({
        id: id ?? `${round}_${slot}`,
        label: ROUND_LABELS[round],
        teamIds,
        dateISO: doc?.header?.competitions?.[0]?.date ?? sched?.date,
        venue: doc?.header?.competitions?.[0]?.venue ?? (sched ? { fullName: sched.venue } : null),
        doc,
        live: id ? sbById.get(String(id)) : null,
      }))
    })
  }

  // Only datable fixtures can be placed on the calendar; sort chronologically.
  return fixtures
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
