// Score-split facts for the stadium page. Prefers the stored `scoreFacts`
// written by the backend (firebase/functions/lib/normalize.computeScoreFacts),
// and falls back to computing the same thing from `scoringPlays` for match docs
// written before that field existed. Regulation goals only (periods 1 & 2) —
// extra time and shootouts are excluded by design.

function baseMinute(clock) {
  const n = parseInt(String(clock || '').replace(/[^\d].*$/, ''), 10)
  return Number.isFinite(n) ? n : 0
}

// { scoreAt70, regulationFinal, was1_0at70, finishedRegAt1_1 } aligned to
// match.competitors[], or null if the match isn't a normal two-team fixture.
export function matchScoreFacts(match) {
  if (match?.scoreFacts) return match.scoreFacts
  const competitors = match?.competitors ?? []
  if (competitors.length !== 2) return null
  const ids = competitors.map((c) => c.teamId)
  const isReg = (p) => p.period === 1 || p.period === 2
  const tally = (pred) => {
    const s = Object.fromEntries(ids.map((id) => [id, 0]))
    for (const p of match.scoringPlays ?? []) {
      if (p.teamId in s && pred(p)) s[p.teamId] += 1
    }
    return ids.map((id) => s[id])
  }
  const scoreAt70 = tally((p) => isReg(p) && baseMinute(p.minute) <= 70)
  const regulationFinal = tally((p) => isReg(p))
  const sum = (a) => a.reduce((x, y) => x + y, 0)
  return {
    scoreAt70,
    regulationFinal,
    was1_0at70: sum(scoreAt70) === 1,
    finishedRegAt1_1: regulationFinal[0] === 1 && regulationFinal[1] === 1,
  }
}

// Live candidates for the 1–0-at-70' watch, derived purely from the streaming
// liveData/scoreboard events[] (current aggregate score + clock) — the detailed
// matches/{eventId} doc with goal minutes is only re-fetched at state flips, so
// it's stale mid-match and can't be used here. A candidate is an in-progress
// regulation match (period 1 or 2) that's past the 70' mark with a 1–0
// scoreline right now: the live games you'd watch for a late equalizer.
//
// Caveat baked into the framing (see ScoreSplitsCard copy): without goal
// minutes we can't prove the lone goal landed before exactly 70', so this is
// "currently 1–0, 70'+" rather than the precise "was 1–0 at 70'" the completed
// tally computes. Once a second goal makes it 1–1 the total is no longer 1 and
// the game drops out — it reappears in the completed tally only after it ends.
export function liveScoreSplitCandidates(events) {
  const out = []
  for (const e of events ?? []) {
    if (e.status?.state !== 'in') continue
    // Regulation only — extra time/shootout goals would break the 1–0 framing.
    const period = e.status?.period ?? 0
    if (period !== 1 && period !== 2) continue
    const minute = baseMinute(e.status?.displayClock)
    if (minute < 70) continue
    const competitors = e.competitors ?? []
    if (competitors.length !== 2) continue
    const scores = competitors.map((c) => parseInt(c.score, 10) || 0)
    // Exactly one goal on the board ⇒ the match is 1–0 right now.
    if (scores[0] + scores[1] !== 1) continue
    out.push({ event: e, minute, displayClock: e.status?.displayClock ?? null, scores })
  }
  return out
}

// Aggregate over completed matches: the games that were 1–0 at 70', and within
// that set which finished regulation 1–1 (the rest "didn't hit").
export function scoreSplitSummary(matches) {
  const games = []
  for (const m of matches ?? []) {
    if (m.status?.state !== 'post') continue
    const facts = matchScoreFacts(m)
    if (!facts?.was1_0at70) continue
    games.push({
      match: m,
      date: m.header?.competitions?.[0]?.date ?? m.date ?? null,
      regulationFinal: facts.regulationFinal,
      finished1_1: !!facts.finishedRegAt1_1,
    })
  }
  // Chronological (earliest first); ISO date strings sort lexicographically.
  // Undated games sink to the end (￿ sorts after any real date).
  const sortKey = (g) => g.date ?? '￿'
  games.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  return {
    total: games.length,
    finished1_1: games.filter((g) => g.finished1_1).length,
    games,
  }
}
