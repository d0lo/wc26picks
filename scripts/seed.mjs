/**
 * seed.mjs — Seeds teams/ and players/ collections, then migrates submissions/ → picks/.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/seed.mjs
 *
 * Reads FIREBASE_PROJECT_ID from env (defaults to 'wc26picks').
 * Leaves submissions/ untouched as a read-only backup.
 */

import { createRequire } from 'module'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Load app data (ES modules via dynamic parse) ─────────────────────────────
const appSrc = join(__dirname, '../app/src')

function loadModule(file) {
  const src = readFileSync(join(appSrc, file), 'utf8')
  const stripped = src.replace(/^export const /gm, 'const ').replace(/^export default /gm, 'const _default = ')
  const m = new Function('exports', stripped + '\nfor(const k of Object.keys(this)) exports[k] = this[k]')
  const ctx = {}
  try {
    m.call(ctx, ctx)
  } catch {}
  // Fallback: eval-style extraction
  const match = src.match(/export const (\w+)\s*=\s*/)
  if (match) {
    const varName = match[1]
    const code2 = src.replace(/^export const /gm, 'globalThis.__TMP__ = undefined; const ')
    const fn = new Function(code2 + `; globalThis.__TMP__ = ${varName}`)
    try { fn(); ctx[varName] = globalThis.__TMP__ } catch {}
  }
  return ctx
}

// We need a proper ESM-compatible way to import these
// Use createRequire trick: transform and eval
function evalESM(src) {
  const js = src
    .replace(/^export const /gm, 'const ')
    .replace(/^export default /gm, 'const __default = ')
  const fn = new Function('require', '__dirname', js + '\nreturn {ROSTERS, GROUP_TEAMS, GROUPS, TEAM_FLAG, TEAM_ID, FIFA_RANKING, PROPS}')
  return fn(require, __dirname)
}

const dataSrc = readFileSync(join(appSrc, 'data.js'), 'utf8')
const rostersSrc = readFileSync(join(appSrc, 'rosters.js'), 'utf8')

let DATA, ROSTERS_DATA
try {
  DATA = evalESM(dataSrc)
  ROSTERS_DATA = evalESM(rostersSrc)
} catch (e) {
  console.error('Failed to parse app data:', e.message)
  process.exit(1)
}

const { GROUP_TEAMS, GROUPS, TEAM_FLAG, TEAM_ID, FIFA_RANKING } = DATA
const ROSTERS = ROSTERS_DATA.ROSTERS

// ── Firebase Admin ────────────────────────────────────────────────────────────
let admin
try {
  admin = require('firebase-admin')
} catch {
  console.error('firebase-admin not found. Run: npm install firebase-admin (in firebase/ dir)')
  process.exit(1)
}

const projectId = process.env.FIREBASE_PROJECT_ID ?? 'wc26picks'

if (!admin.apps.length) {
  const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? admin.credential.applicationDefault()
    : (() => { throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path') })()
  admin.initializeApp({ credential, projectId })
}

const db = admin.firestore()
const BATCH_LIMIT = 400

// ── Prop key migration map (old spaced keys → new camelCase) ─────────────────
const PROP_KEY_MAP = {
  'Golden Boot':     'goldenBoot',
  'Golden Glove':    'goldenGlove',
  'Golden Ball':     'goldenBall',
  'Young Player':    'youngPlayer',
  'Breakout Player': 'breakoutPlayer',
  'Most Group Goals':'mostGroupGoals',
  'Hat Trick Scorer':'hatTrickScorer',
  'Most Assists':    'mostAssists',
  'Most Yellow Cards':'mostYellowCards',
  'Clean Sheet Group':'cleanGroupTeam',
}

// Also handle already-camelCase keys (idempotent re-run)
const PROP_KEYS_CAMEL = new Set(Object.values(PROP_KEY_MAP))

// ── Build player lookup: name → id (per team) ─────────────────────────────────
const PLAYER_ID_BY_TEAM_NAME = {} // { teamName: { playerName: playerId } }
for (const [team, players] of Object.entries(ROSTERS)) {
  PLAYER_ID_BY_TEAM_NAME[team] = {}
  for (const p of players) {
    PLAYER_ID_BY_TEAM_NAME[team][p.name] = p.id
  }
}

// Flat lookup by name across all teams (for compound "Name (flag)" format)
const PLAYER_ID_BY_NAME_GLOBAL = {} // { playerName: playerId } — last-write-wins if collision
for (const [team, players] of Object.entries(ROSTERS)) {
  for (const p of players) {
    PLAYER_ID_BY_NAME_GLOBAL[p.name] = p.id
  }
}

// ── Team name lookup: flag emoji → team name ──────────────────────────────────
const FLAG_TO_TEAM = Object.fromEntries(Object.entries(TEAM_FLAG).map(([k, v]) => [v, k]))

// ── Seed teams/ ───────────────────────────────────────────────────────────────
async function seedTeams() {
  console.log('\n── Seeding teams/ ──────────────────────────────────────────')
  const batches = []
  let batch = db.batch()
  let count = 0

  for (const [letter, teams] of Object.entries(GROUP_TEAMS)) {
    for (const name of teams) {
      const id = TEAM_ID[name]
      if (!id) { console.warn(`  WARN: No TEAM_ID for "${name}"`); continue }
      const ref = db.collection('teams').doc(id)
      batch.set(ref, {
        id,
        name,
        group: letter,
        flag: TEAM_FLAG[name] ?? null,
        fifaRanking: FIFA_RANKING[name] ?? null,
        espn: null,
      })
      count++
      if (count % BATCH_LIMIT === 0) {
        batches.push(batch)
        batch = db.batch()
      }
    }
  }
  batches.push(batch)
  for (const b of batches) await b.commit()
  console.log(`  ✓ Seeded ${count} team docs`)
}

// ── Seed players/ ─────────────────────────────────────────────────────────────
async function seedPlayers() {
  console.log('\n── Seeding players/ ────────────────────────────────────────')
  const batches = []
  let batch = db.batch()
  let count = 0

  for (const [teamName, players] of Object.entries(ROSTERS)) {
    const teamId = TEAM_ID[teamName]
    if (!teamId) { console.warn(`  WARN: No TEAM_ID for roster team "${teamName}"`); continue }
    for (const p of players) {
      const ref = db.collection('players').doc(p.id)
      batch.set(ref, {
        id: p.id,
        name: p.name,
        teamId,
        pos: p.pos,
        num: p.num ?? null,
        dob: p.dob ?? null,
        espn: null,
      })
      count++
      if (count % BATCH_LIMIT === 0) {
        batches.push(batch)
        batch = db.batch()
      }
    }
  }
  batches.push(batch)
  for (const b of batches) await b.commit()
  console.log(`  ✓ Seeded ${count} player docs`)
}

// ── Resolve player UUID from old compound string ──────────────────────────────
function resolvePlayerUUID(compoundVal) {
  if (!compoundVal) return null
  // Format: "Player Name (🇦🇷)" or "Player Name (Argentina)"
  const m = compoundVal.match(/^(.+?)\s*\(([^)]+)\)$/)
  let playerName = compoundVal
  let teamName = null

  if (m) {
    playerName = m[1].trim()
    const raw = m[2]
    teamName = FLAG_TO_TEAM[raw] ?? raw
  }

  // Try team-scoped lookup first
  if (teamName && PLAYER_ID_BY_TEAM_NAME[teamName]?.[playerName]) {
    return PLAYER_ID_BY_TEAM_NAME[teamName][playerName]
  }
  // Fall back to global name search
  if (PLAYER_ID_BY_NAME_GLOBAL[playerName]) {
    return PLAYER_ID_BY_NAME_GLOBAL[playerName]
  }
  return null
}

// ── Resolve team UUID from old team name string ───────────────────────────────
function resolveTeamUUID(nameVal) {
  if (nameVal === '__none__' || nameVal === null || nameVal === undefined) return null
  return TEAM_ID[nameVal] ?? null
}

// ── Migrate submissions/ → picks/ ─────────────────────────────────────────────
async function migrateSubmissions() {
  console.log('\n── Migrating submissions/ → picks/ ─────────────────────────')
  const submissionsSnap = await db.collection('submissions').get()
  if (submissionsSnap.empty) {
    console.log('  No submissions found — skipping migration')
    return
  }

  let ok = 0
  let failed = 0
  const batches = []
  let batch = db.batch()
  let batchCount = 0

  for (const docSnap of submissionsSnap.docs) {
    const uid = docSnap.id
    const sub = docSnap.data()
    let docFailed = false

    // ── Migrate groups ────────────────────────────────────────────────
    const groups = {}
    for (const [letter, teamNames] of Object.entries(sub.groups ?? {})) {
      const ids = []
      for (const name of teamNames) {
        const id = TEAM_ID[name]
        if (!id) {
          console.error(`  FAIL uid=${uid} groups.${letter}: cannot resolve team "${name}"`)
          ids.push({ _migrationFailed: true, _original: name })
          docFailed = true
        } else {
          ids.push(id)
        }
      }
      groups[letter] = ids
    }

    // ── Migrate props ─────────────────────────────────────────────────
    const props = {}
    const rawProps = sub.props ?? {}

    for (const [rawKey, rawVal] of Object.entries(rawProps)) {
      // Normalise key: old spaced → camelCase (idempotent for already-camelCase)
      const newKey = PROP_KEY_MAP[rawKey] ?? (PROP_KEYS_CAMEL.has(rawKey) ? rawKey : rawKey)

      // Find prop definition to determine type
      const propDef = Object.values(PROP_KEY_MAP).includes(newKey)
        ? { type: newKey.startsWith('golden') || newKey.endsWith('Boot') || newKey === 'youngPlayer' || newKey === 'breakoutPlayer' || newKey === 'hatTrickScorer' || newKey === 'mostAssists' ? 'player' : 'team' }
        : null

      // Determine type from key naming
      const isPlayerProp = ['goldenBoot','goldenGlove','goldenBall','youngPlayer','breakoutPlayer','hatTrickScorer','mostAssists'].includes(newKey)
      const isTeamProp = ['mostGroupGoals','mostYellowCards','cleanGroupTeam'].includes(newKey)

      if (isPlayerProp) {
        // Already a UUID (re-run)? Check length.
        if (rawVal && rawVal.match(/^[0-9a-f]{8}-[0-9a-f]{4}-/)) {
          props[newKey] = rawVal
        } else {
          const playerId = resolvePlayerUUID(rawVal)
          if (!playerId) {
            console.error(`  FAIL uid=${uid} props.${newKey}: cannot resolve player "${rawVal}"`)
            props[newKey] = { _migrationFailed: true, _original: rawVal }
            docFailed = true
          } else {
            props[newKey] = playerId
          }
        }
      } else if (isTeamProp) {
        if (rawVal === null || rawVal === '__none__') {
          props[newKey] = null
        } else if (rawVal && rawVal.match(/^[0-9a-f]{8}-[0-9a-f]{4}-/)) {
          props[newKey] = rawVal
        } else {
          const teamId = resolveTeamUUID(rawVal)
          if (teamId === null && rawVal !== '__none__' && rawVal !== null) {
            console.error(`  FAIL uid=${uid} props.${newKey}: cannot resolve team "${rawVal}"`)
            props[newKey] = { _migrationFailed: true, _original: rawVal }
            docFailed = true
          } else {
            props[newKey] = teamId
          }
        }
      } else {
        props[newKey] = rawVal
      }
    }

    if (docFailed) failed++
    else ok++

    const pickRef = db.collection('picks').doc(uid)
    batch.set(pickRef, {
      uid: sub.uid ?? uid,
      name: sub.name ?? null,
      photoURL: sub.photoURL ?? null,
      submittedAt: sub.submittedAt ?? null,
      groups,
      wildcards: sub.wildcards ?? [],
      props,
    })

    batchCount++
    if (batchCount % BATCH_LIMIT === 0) {
      batches.push(batch)
      batch = db.batch()
    }
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
  console.error('\n✗ Fatal error:', err)
  process.exit(1)
}
