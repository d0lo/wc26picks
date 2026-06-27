/**
 * backfill-matches.mjs — One-time backfill for matches/{eventId} and
 * groups/{letter}, which were never written because espnPoller/onScoreboardWrite
 * weren't successfully deployed until 2026-06-27. Walks every day since the
 * tournament's opening match, finds completed events, and writes them using
 * the same normalization the live trigger uses (firebase/functions/lib/).
 *
 * Also recomputes scores/{uid} so the leaderboard reflects real results
 * immediately. The scoring functions below are copied from PR #29's
 * firebase/functions/lib/scoring.js (feature/auto-scoring-engine), since
 * that trigger isn't deployed yet — functions only deploy on push to `dev`.
 * Delete this duplication once PR #29 merges; after that, matches/{eventId}
 * writes alone will keep scores/{uid} in sync via onMatchComplete.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/backfill-matches.mjs
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { normalizeMatch, parseGroupLetter } from '../firebase/functions/lib/normalize.js'

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks',
  })
}

const db = getFirestore()
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'
const TOURNAMENT_START = '2026-06-11' // confirmed opening match (760415, South Africa at Mexico)
const SLEEP_MS = 150 // be polite to ESPN's public API across ~70+ summary calls

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '')

async function fetchScoreboardForDate(yyyymmdd) {
  const url = `${ESPN_BASE}/scoreboard?dates=${yyyymmdd}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN scoreboard fetch failed: ${res.status} ${url}`)
  return res.json()
}

async function fetchSummary(eventId) {
  const url = `${ESPN_BASE}/summary?event=${eventId}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN summary fetch failed: ${res.status} ${url}`)
  return res.json()
}

// ── Step 1: find every completed match since the tournament started ────────
async function findCompletedEvents() {
  const completed = new Map()
  const start = new Date(`${TOURNAMENT_START}T00:00:00Z`)
  const today = new Date()

  for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = ymd(d)
    const raw = await fetchScoreboardForDate(dateStr)
    for (const e of raw.events || []) {
      if (e.competitions?.[0]?.status?.type?.state === 'post') completed.set(e.id, e)
    }
    await sleep(SLEEP_MS)
  }
  return completed
}

// ── Step 2: write matches/{eventId} + groups/{letter}, mirroring the
// already-deployed processMatchUpdate() in firebase/functions/index.js ──────
async function backfillMatch(eventId) {
  const summary = await fetchSummary(eventId)
  const match = normalizeMatch(summary)

  await db.doc(`matches/${eventId}`).set(
    { eventId, fetchedAt: FieldValue.serverTimestamp(), ...match },
    { merge: true }
  )

  if (match.groupStandings.length > 0) {
    const groupName = summary.header.competitions[0].competitors[0]?.team?.groups?.name
    const letter = parseGroupLetter(groupName)
    if (letter) {
      await db
        .doc(`groups/${letter}`)
        .set({ letter, updatedAt: FieldValue.serverTimestamp(), entries: match.groupStandings }, { merge: true })
    }
  }
}

// ── Step 3: scoring (copied from PR #29's lib/scoring.js — see file header) ─
function scoreGroupPrediction(predicted, standings, scoring) {
  const actualOrder = (standings ?? []).map((e) => e.team?.id)
  if (!Array.isArray(predicted) || predicted.length === 0 || actualOrder.length === 0) {
    return { points: 0, exactPositions: 0 }
  }
  let points = 0
  let exactPositions = 0
  predicted.forEach((teamId, i) => {
    if (teamId && actualOrder[i] === teamId) {
      points += Number(scoring?.groupExact?.[i + 1] ?? 0)
      exactPositions += 1
    }
  })
  if (exactPositions === 4 && actualOrder.length === 4) {
    points += Number(scoring?.perfectGroupBonus ?? 0)
  }
  return { points, exactPositions }
}

const ADVANCING_THIRD_PLACE_COUNT = 8

function rankThirdPlaceTeams(groupsByLetter) {
  const thirds = Object.entries(groupsByLetter ?? {})
    .map(([letter, entries]) => entries?.[2] && { letter, ...entries[2] })
    .filter(Boolean)
  return thirds.sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || (b.goalDiff ?? 0) - (a.goalDiff ?? 0))
}

function scoreWildcardPicks(pickedLetters, groupsByLetter, scoring) {
  if (!Array.isArray(pickedLetters) || pickedLetters.length === 0) return 0
  const advancing = new Set(
    rankThirdPlaceTeams(groupsByLetter).slice(0, ADVANCING_THIRD_PLACE_COUNT).map((t) => t.letter)
  )
  const perPick = Number(scoring?.wildcard ?? 0)
  return pickedLetters.filter((letter) => advancing.has(letter)).length * perPick
}

async function recomputeScores() {
  const [groupsSnap, picksSnap, configSnap] = await Promise.all([
    db.collection('groups').get(),
    db.collection('picks').get(),
    db.doc('config/public').get(),
  ])

  const groupsByLetter = Object.fromEntries(groupsSnap.docs.map((d) => [d.id, d.data()?.entries ?? []]))
  const scoring = configSnap.data()?.scoring ?? {}

  for (const picksDoc of picksSnap.docs) {
    const pick = picksDoc.data()
    const groups = {}
    for (const [letter, standings] of Object.entries(groupsByLetter)) {
      if (!standings.length) continue
      groups[letter] = scoreGroupPrediction(pick.groups?.[letter], standings, scoring).points
    }
    const wildcardPoints = scoreWildcardPicks(pick.wildcards, groupsByLetter, scoring)
    const groupsTotal = Object.values(groups).reduce((sum, v) => sum + v, 0)
    const existingProps = (await db.doc(`scores/${picksDoc.id}`).get()).data()?.breakdown?.props ?? 0

    await db.doc(`scores/${picksDoc.id}`).set(
      {
        uid: picksDoc.id,
        breakdown: { groups, wildcards: wildcardPoints, props: existingProps },
        total: groupsTotal + wildcardPoints + existingProps,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
  }
}

const completed = await findCompletedEvents()
console.log(`Found ${completed.size} completed matches since ${TOURNAMENT_START}`)

let i = 0
for (const eventId of completed.keys()) {
  i += 1
  await backfillMatch(eventId)
  console.log(`[${i}/${completed.size}] backfilled match ${eventId}`)
  await sleep(SLEEP_MS)
}

console.log('Recomputing scores/{uid} from backfilled groups...')
await recomputeScores()
console.log('Done.')
