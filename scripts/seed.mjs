/**
 * seed.mjs — Seeds teams/ and players/ collections, then migrates submissions/ → picks/.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/seed.mjs
 *
 * Leaves submissions/ untouched as a read-only backup.
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appSrc = join(__dirname, '../app/src')

// ── Load app data via dynamic import ─────────────────────────────────────────
const { GROUP_TEAMS, GROUPS, TEAM_FLAG, TEAM_ID, FIFA_RANKING } = await import(join(appSrc, 'data.js'))
const { ROSTERS } = await import(join(appSrc, 'rosters.js'))

// ── Firebase Admin ────────────────────────────────────────────────────────────
if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks',
  })
}

const db = getFirestore()
const BATCH_LIMIT = 400

// ── Prop key migration map (old spaced keys → new camelCase) ─────────────────
const PROP_KEY_MAP = {
  'Golden Boot':      'goldenBoot',
  'Golden Glove':     'goldenGlove',
  'Golden Ball':      'goldenBall',
  'Young Player':     'youngPlayer',
  'Breakout Player':  'breakoutPlayer',
  'Most Group Goals': 'mostGroupGoals',
  'Hat Trick Scorer': 'hatTrickScorer',
  'Most Assists':     'mostAssists',
  'Most Yellow Cards':'mostYellowCards',
  'Clean Sheet Group':'cleanGroupTeam',
}
const PROP_KEYS_CAMEL = new Set(Object.values(PROP_KEY_MAP))
const PLAYER_PROP_KEYS = new Set(['goldenBoot','goldenGlove','goldenBall','youngPlayer','breakoutPlayer','hatTrickScorer','mostAssists'])
const TEAM_PROP_KEYS   = new Set(['mostGroupGoals','mostYellowCards','cleanGroupTeam'])

// ── Build player lookups ──────────────────────────────────────────────────────
const PLAYER_BY_TEAM_NAME = {}   // { teamName: { playerName: playerId } }
const PLAYER_BY_NAME_GLOBAL = {} // { playerName: playerId } last-write-wins

for (const [team, players] of Object.entries(ROSTERS)) {
  PLAYER_BY_TEAM_NAME[team] = {}
  for (const p of players) {
    PLAYER_BY_TEAM_NAME[team][p.name] = p.id
    PLAYER_BY_NAME_GLOBAL[p.name] = p.id
  }
}

// flag emoji → team name
const FLAG_TO_TEAM = Object.fromEntries(Object.entries(TEAM_FLAG).map(([k, v]) => [v, k]))

// ── Resolve helpers ───────────────────────────────────────────────────────────
function resolvePlayerUUID(val) {
  if (!val) return null
  // Already a UUID?
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(val)) return val
  // "Name (🇦🇷)" or "Name (Argentina)"
  const m = val.match(/^(.+?)\s*\(([^)]+)\)$/)
  const playerName = m ? m[1].trim() : val
  const teamName   = m ? (FLAG_TO_TEAM[m[2]] ?? m[2]) : null
  if (teamName && PLAYER_BY_TEAM_NAME[teamName]?.[playerName]) return PLAYER_BY_TEAM_NAME[teamName][playerName]
  return PLAYER_BY_NAME_GLOBAL[playerName] ?? null
}

function resolveTeamUUID(val) {
  if (val === '__none__' || val === null || val === undefined) return null
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(val)) return val
  return TEAM_ID[val] ?? null
}

// ── Seed teams/ ───────────────────────────────────────────────────────────────
async function seedTeams() {
  console.log('\n── Seeding teams/ ──────────────────────────────────────────')
  let batch = db.batch(); let count = 0; const batches = []
  for (const [letter, teams] of Object.entries(GROUP_TEAMS)) {
    for (const name of teams) {
      const id = TEAM_ID[name]
      if (!id) { console.warn(`  WARN: No TEAM_ID for "${name}"`); continue }
      batch.set(db.collection('teams').doc(id), { id, name, group: letter, flag: TEAM_FLAG[name] ?? null, fifaRanking: FIFA_RANKING[name] ?? null, espn: null })
      if (++count % BATCH_LIMIT === 0) { batches.push(batch); batch = db.batch() }
    }
  }
  batches.push(batch)
  for (const b of batches) await b.commit()
  console.log(`  ✓ ${count} teams`)
}

// ── Seed players/ ─────────────────────────────────────────────────────────────
async function seedPlayers() {
  console.log('\n── Seeding players/ ────────────────────────────────────────')
  let batch = db.batch(); let count = 0; const batches = []
  for (const [teamName, players] of Object.entries(ROSTERS)) {
    const teamId = TEAM_ID[teamName]
    if (!teamId) { console.warn(`  WARN: No TEAM_ID for "${teamName}"`); continue }
    for (const p of players) {
      batch.set(db.collection('players').doc(p.id), { id: p.id, name: p.name, teamId, pos: p.pos, num: p.num ?? null, dob: p.dob ?? null, espn: null })
      if (++count % BATCH_LIMIT === 0) { batches.push(batch); batch = db.batch() }
    }
  }
  batches.push(batch)
  for (const b of batches) await b.commit()
  console.log(`  ✓ ${count} players`)
}

// ── Migrate submissions/ → picks/ ─────────────────────────────────────────────
async function migrateSubmissions() {
  console.log('\n── Migrating submissions/ → picks/ ─────────────────────────')
  const snap = await db.collection('submissions').get()
  if (snap.empty) { console.log('  No submissions found'); return }

  let ok = 0, failed = 0
  let batch = db.batch(); let batchCount = 0; const batches = []

  for (const docSnap of snap.docs) {
    const uid = docSnap.id
    const sub = docSnap.data()
    let docFailed = false

    // Groups
    const groups = {}
    for (const [letter, teamNames] of Object.entries(sub.groups ?? {})) {
      groups[letter] = teamNames.map(name => {
        const id = TEAM_ID[name]
        if (!id) { console.error(`  FAIL uid=${uid} groups.${letter}: cannot resolve team "${name}"`); docFailed = true; return { _migrationFailed: true, _original: name } }
        return id
      })
    }

    // Props
    const props = {}
    for (const [rawKey, rawVal] of Object.entries(sub.props ?? {})) {
      const newKey = PROP_KEY_MAP[rawKey] ?? (PROP_KEYS_CAMEL.has(rawKey) ? rawKey : rawKey)
      if (PLAYER_PROP_KEYS.has(newKey)) {
        const id = resolvePlayerUUID(rawVal)
        if (!id) { console.error(`  FAIL uid=${uid} props.${newKey}: cannot resolve player "${rawVal}"`); docFailed = true; props[newKey] = { _migrationFailed: true, _original: rawVal } }
        else props[newKey] = id
      } else if (TEAM_PROP_KEYS.has(newKey)) {
        const id = resolveTeamUUID(rawVal)
        if (id === null && rawVal !== '__none__' && rawVal !== null) {
          console.error(`  FAIL uid=${uid} props.${newKey}: cannot resolve team "${rawVal}"`); docFailed = true; props[newKey] = { _migrationFailed: true, _original: rawVal }
        } else props[newKey] = id
      } else {
        props[newKey] = rawVal
      }
    }

    docFailed ? failed++ : ok++
    batch.set(db.collection('picks').doc(uid), { uid: sub.uid ?? uid, name: sub.name ?? null, photoURL: sub.photoURL ?? null, submittedAt: sub.submittedAt ?? null, groups, wildcards: sub.wildcards ?? [], props })
    if (++batchCount % BATCH_LIMIT === 0) { batches.push(batch); batch = db.batch() }
  }
  batches.push(batch)
  for (const b of batches) await b.commit()
  console.log(`\n  Summary: ${ok} migrated OK, ${failed} failed`)
  if (failed > 0) console.warn('  ⚠ Fix failures above before deploying the updated app.')
}

// ── Main ──────────────────────────────────────────────────────────────────────
try {
  await seedTeams()
  await seedPlayers()
  await migrateSubmissions()
  console.log('\n✓ Done.\n')
  process.exit(0)
} catch (err) {
  console.error('\n✗ Fatal:', err)
  process.exit(1)
}
