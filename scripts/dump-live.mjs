/**
 * dump-live.mjs — Diagnostic (read-only, writes nothing). Inspects the live
 * data path feeding the bracket/stadium: the stored scoreboard, the schedule
 * doc's knockout fixtures, and what ESPN actually returns right now for the
 * default matchday vs today's explicit date. Safe to delete.
 */
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { fetchScoreboard, fetchScoreboardForDate } from '../firebase/functions/lib/espn.js'
import { knockoutRoundSlot } from '../firebase/functions/lib/normalize.js'

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks' })
}
const db = getFirestore()
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
console.log('UTC today:', today, '| now:', new Date().toISOString())

const sb = (await db.doc('liveData/scoreboard').get()).data()
console.log(`\n=== stored liveData/scoreboard === scheduleDate=${sb?.scheduleDate} state=${sb?.state} events=${sb?.events?.length ?? 0}`)
for (const e of sb?.events ?? []) console.log(`  ${e.id} ${e.status?.state} ${e.status?.displayClock ?? ''} round=${e.round ?? '-'}`)

const sched = (await db.doc('liveData/schedule').get()).data()
const ko = (sched?.events ?? []).filter((e) => e.round)
console.log(`\n=== schedule doc knockout fixtures (${ko.length}) ===`)
for (const e of ko.slice(0, 8)) console.log(`  ${e.id} ${e.round}/${e.slot} ${e.status?.state} date=${e.date}`)

async function dumpEspn(label, raw) {
  const evs = raw.events || []
  console.log(`\n=== ESPN ${label} (${evs.length}) ===`)
  for (const e of evs) {
    const ks = knockoutRoundSlot(e.id)
    console.log(`  ${e.id} ${e.competitions?.[0]?.status?.type?.state} date=${e.date} ${ks ? ks.round + '/' + ks.slot : 'group'}`)
  }
}
await dumpEspn('default /scoreboard', await fetchScoreboard())
await dumpEspn(`/scoreboard?dates=${today}`, await fetchScoreboardForDate(today))
process.exit(0)
