// Pure helpers for the espnPoller's self-gating, extracted so they can be unit
// tested without Firestore. The poller wakes (does an ESPN fetch) based on
// TODAY's full kickoff list derived from liveData/schedule — not just the
// events from its own last fetch. Otherwise, once the last *fetched* kickoff
// went "post" it slept for the rest of the UTC day and missed any game that
// kicked off later (e.g. the Round of 32 after the group-stage finale).

export function utcDateString(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

const RANK = { pre: 0, in: 1, post: 2 }
// Returns whichever of two states is further along (pre < in < post), so a
// known result can never regress when merging snapshots from different sources.
export function moreProgressed(a, b) {
  return (RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a
}

// A game more than this long past kickoff is assumed finished even if we never
// captured it (e.g. it kicked off and ended entirely during a sleep, then ESPN
// dropped it from the scoreboard) — so it can't wake the poller forever.
export const WAKE_WINDOW_MS = 12 * 60 * 60 * 1000

// Today's kickoff ledger: every schedule fixture dated today (seeded with the
// schedule's own state), merged with any state we've already recorded today
// (post/in is sticky), so finished games stay finished and later kickoffs are
// still tracked.
export function todaysKickoffs(scheduleEvents, priorData, today) {
  const byId = new Map()
  for (const e of scheduleEvents ?? []) {
    if (utcDateString(new Date(e.date)) === today) {
      byId.set(String(e.id), { eventId: String(e.id), date: e.date, state: e.status?.state ?? 'pre' })
    }
  }
  if (priorData?.scheduleDate === today) {
    for (const k of priorData?.kickoffs ?? []) {
      const prev = byId.get(String(k.eventId))
      if (prev) prev.state = moreProgressed(prev.state, k.state)
      else byId.set(String(k.eventId), { eventId: String(k.eventId), date: k.date, state: k.state })
    }
  }
  return [...byId.values()]
}

// Fold the freshly-fetched scoreboard events into the kickoff ledger so the
// poller stays self-sufficient even when liveData/schedule is missing a match
// (or hasn't been written yet): a fetched event not already tracked is added,
// and a known one advances to its newest state (post stays sticky). Without
// this the ledger would be purely schedule-derived and the poller could sleep
// through a live match the schedule doc never listed.
export function mergeFetchedKickoffs(kickoffs, events) {
  const byId = new Map(kickoffs.map((k) => [k.eventId, { ...k }]))
  for (const e of events ?? []) {
    const id = String(e.id)
    const prev = byId.get(id)
    if (prev) prev.state = moreProgressed(prev.state, e.status?.state)
    else byId.set(id, { eventId: id, date: e.date, state: e.status?.state ?? 'pre' })
  }
  return [...byId.values()]
}

export function shouldFetch(priorData, today, now, kickoffs) {
  if (priorData?.state === 'polling') return true     // a chain is live — keep polling
  if (priorData?.scheduleDate !== today) return true  // new day — learn its slate
  return kickoffs.some((k) => {
    if (k.state === 'post') return false
    const t = new Date(k.date).getTime()
    return now >= t && now <= t + WAKE_WINDOW_MS
  })
}
