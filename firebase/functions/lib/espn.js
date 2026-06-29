const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'

export async function fetchScoreboard() {
  const url = `${BASE}/scoreboard`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN scoreboard fetch failed: ${res.status} ${url}`)
  return res.json()
}

// Scoreboard for a specific day (YYYYMMDD) — used by the daily schedule sync to
// learn every fixture across the tournament, not just today's.
export async function fetchScoreboardForDate(yyyymmdd) {
  const url = `${BASE}/scoreboard?dates=${yyyymmdd}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN scoreboard(${yyyymmdd}) fetch failed: ${res.status} ${url}`)
  return res.json()
}

export async function fetchSummary(eventId) {
  const url = `${BASE}/summary?event=${eventId}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN summary fetch failed: ${res.status} ${url}`)
  return res.json()
}
