/**
 * dump-live.mjs — Diagnostic: prints liveData/scoreboard, liveData/schedule
 * count, and any in-progress matches/{eventId}, to verify the live-data path
 * feeding the bracket/stadium. Read-only; writes nothing. Safe to delete.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/dump-live.mjs
 */
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks' })
}
const db = getFirestore()

const sb = (await db.doc('liveData/scoreboard').get()).data()
console.log('=== liveData/scoreboard ===')
console.log('scheduleDate:', sb?.scheduleDate, '| state:', sb?.state, '| hasMatches:', sb?.hasMatches, '| events:', sb?.events?.length ?? 0)
for (const e of sb?.events ?? []) {
  console.log(`  EV ${e.id} ${e.status?.state} ${e.status?.displayClock ?? ''} round=${e.round ?? '-'} ::`,
    (e.competitors ?? []).map((c) => `${c.teamId?.slice(0, 8)}=${c.score}`).join('  '))
}

const sched = (await db.doc('liveData/schedule').get()).data()
console.log('\n=== liveData/schedule ===')
console.log('count:', sched?.count, '| events:', sched?.events?.length ?? 0)

const matchesSnap = await db.collection('matches').get()
const inProgress = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.status?.state === 'in')
console.log('\n=== matches ===')
console.log('total:', matchesSnap.size, '| in-progress:', inProgress.length)
for (const m of inProgress) console.log(`  ${m.id} round=${m.round ?? '-'}/${m.slot ?? '-'} ${m.status?.state}`)
process.exit(0)
