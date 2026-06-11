// Fetches birth dates from Wikipedia "2026 FIFA World Cup squads" and enriches rosters.js
import { ROSTERS } from '../app/src/rosters.js'
import { writeFileSync } from 'fs'

const WIKI_API = 'https://en.wikipedia.org/w/api.php'

async function fetchSquadsHtml() {
  const url = `${WIKI_API}?action=parse&page=2026+FIFA+World+Cup+squads&prop=text&format=json`
  const r = await fetch(url, { headers: { 'User-Agent': 'wc26picks-dob-enricher/1.0 (dan.barzyk54@gmail.com)' } })
  const j = await r.json()
  return j.parse?.text?.['*'] ?? null
}

// Parse all players and their DOBs from the squads page HTML
// Each row: <th data-sort-value="Surname, First">...<a>Name</a>... <span class="bday">YYYY-MM-DD</span>
function parseAllDobs(html) {
  // Map: normalized name -> dob
  const map = new Map()
  const rowRe = /<tr[\s\S]*?<\/tr>/gi
  let m
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[0]
    const bdayMatch = row.match(/<span class="bday">(\d{4}-\d{2}-\d{2})<\/span>/)
    if (!bdayMatch) continue
    const dob = bdayMatch[1]
    // Get player name from the <th> link
    const nameMatch = row.match(/<th[^>]*><a[^>]*>([^<]+)<\/a>/)
    if (!nameMatch) continue
    const name = decodeHtmlEntities(nameMatch[1]).trim()
    map.set(name, dob)
  }
  return map
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c)))
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function matchPlayer(rosterName, dobMap) {
  const rn = norm(rosterName)
  // exact
  for (const [wname, dob] of dobMap) {
    if (norm(wname) === rn) return dob
  }
  // roster name words all present in wiki name
  const rWords = rn.split(/\s+/).filter(w => w.length >= 3)
  if (rWords.length) {
    for (const [wname, dob] of dobMap) {
      const wn = norm(wname)
      if (rWords.every(w => wn.includes(w))) return dob
    }
  }
  // last name match (>=4 chars)
  const rLast = rn.split(/\s+/).pop()
  if (rLast && rLast.length >= 4) {
    const candidates = []
    for (const [wname, dob] of dobMap) {
      const wn = norm(wname)
      if (wn.split(/\s+/).pop() === rLast) candidates.push([wname, dob])
    }
    if (candidates.length === 1) return candidates[0][1]
  }
  return null
}

async function main() {
  console.log('Fetching 2026 FIFA World Cup squads page...')
  const html = await fetchSquadsHtml()
  if (!html) { console.error('Failed to fetch page'); process.exit(1) }

  const dobMap = parseAllDobs(html)
  console.log(`Parsed ${dobMap.size} players with DOBs\n`)

  const enriched = {}
  let totalMatched = 0, totalPlayers = 0, totalMissed = 0

  for (const [team, players] of Object.entries(ROSTERS)) {
    let matched = 0
    const missed = []
    enriched[team] = players.map(p => {
      const dob = matchPlayer(p.name, dobMap)
      if (dob) { matched++; return { ...p, dob } }
      missed.push(p.name)
      return p
    })
    totalMatched += matched
    totalPlayers += players.length
    totalMissed += missed.length
    const pct = Math.round(matched / players.length * 100)
    console.log(`${team}: ${matched}/${players.length} (${pct}%)${missed.length ? ' — missed: ' + missed.join(', ') : ''}`)
  }

  console.log(`\nTotal: ${totalMatched}/${totalPlayers} matched, ${totalMissed} unmatched`)

  const out = `export const ROSTERS = ${JSON.stringify(enriched, null, 2)}\n`
  writeFileSync(new URL('../app/src/rosters.js', import.meta.url), out)
  console.log('Written to app/src/rosters.js')
}

main().catch(console.error)
