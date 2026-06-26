const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'

export async function fetchScoreboard(dateYYYYMMDD) {
  const url = dateYYYYMMDD ? `${BASE}/scoreboard?dates=${dateYYYYMMDD}` : `${BASE}/scoreboard`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN scoreboard fetch failed: ${res.status} ${url}`)
  return res.json()
}

export async function fetchSummary(eventId) {
  const url = `${BASE}/summary?event=${eventId}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN summary fetch failed: ${res.status} ${url}`)
  return res.json()
}
