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
      regulationFinal: facts.regulationFinal,
      finished1_1: !!facts.finishedRegAt1_1,
    })
  }
  return {
    total: games.length,
    finished1_1: games.filter((g) => g.finished1_1).length,
    games,
  }
}
