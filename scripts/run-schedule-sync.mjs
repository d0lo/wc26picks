/**
 * run-schedule-sync.mjs — One-shot manual run of the schedule sync, to populate
 * liveData/schedule immediately instead of waiting for the daily scheduleSync
 * Cloud Function. Same logic as scheduleSync in firebase/functions/index.js,
 * reusing normalizeEvent so team ids/shape match exactly.
 *
 * Writes a skeleton of every tournament fixture (id/date/teams/venue/round/
 * group/state, no scores) — does not touch matches/{eventId} or scoreboard.
 *
 * Usage (via admin-script.yml runner, or locally):
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/run-schedule-sync.mjs
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { normalizeEvent } from '../firebase/functions/lib/normalize.js'

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'
const START = '2026-06-11'
const END = '2026-07-19'

function* dates(startISO, endISO) {
  const day = new Date(`${startISO}T00:00:00Z`)
  const end = new Date(`${endISO}T00:00:00Z`)
  while (day <= end) {
    yield day.toISOString().slice(0, 10).replace(/-/g, '')
    day.setUTCDate(day.getUTCDate() + 1)
  }
}

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks',
  })
}

const db = getFirestore()
const byId = new Map()
for (const ymd of dates(START, END)) {
  try {
    const res = await fetch(`${BASE}/scoreboard?dates=${ymd}`)
    if (!res.ok) { console.warn(`fetch ${ymd}: ${res.status}`); continue }
    const raw = await res.json()
    for (const ev of raw.events || []) byId.set(String(ev.id), normalizeEvent(ev))
  } catch (err) {
    console.warn(`fetch ${ymd} failed: ${err.message}`)
  }
}

const events = [...byId.values()].sort((a, b) => new Date(a.date) - new Date(b.date))
await db.doc('liveData/schedule').set({ updatedAt: FieldValue.serverTimestamp(), count: events.length, events })
console.log(`✓ liveData/schedule written: ${events.length} fixtures`)
process.exit(0)
