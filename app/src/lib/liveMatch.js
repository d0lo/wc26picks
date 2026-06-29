// Merge a finished/in-progress match doc (matches/{eventId}) with today's live
// scoreboard event for the same match. The live event wins while a game is in
// progress (it carries the fresh score + clock); the doc carries the finished
// result. Shared by the picker (BracketView) and the read-only bracket
// (KnockoutBracket) so the merge rule has one home.

export function mergedState(matchDoc, liveEvent) {
  if (liveEvent?.status?.state === 'in') return 'in'
  return matchDoc?.status?.state ?? liveEvent?.status?.state ?? null
}

export function mergedClock(matchDoc, liveEvent, finalLabel = 'Final') {
  const st = mergedState(matchDoc, liveEvent)
  if (st === 'in') return liveEvent?.status?.displayClock || matchDoc?.status?.displayClock || 'Live'
  if (st === 'post') return finalLabel
  return null
}

export function mergedScore(matchDoc, liveEvent, teamId) {
  if (liveEvent && liveEvent.status?.state !== 'pre') {
    const s = liveEvent.competitors?.find((c) => c.teamId === teamId)?.score
    if (s != null && s !== '') return s
  }
  return matchDoc?.competitors?.find((c) => c.teamId === teamId)?.score ?? null
}
