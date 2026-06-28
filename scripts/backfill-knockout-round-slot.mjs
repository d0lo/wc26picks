/**
 * backfill-knockout-round-slot.mjs — Idempotent repair: tags every knockout
 * matches/{eventId} doc with its { round, slot } from the fixed EVENT_SLOT_MAP,
 * for docs written before the trigger tagged them (which made them count as
 * group-stage matches and broke groupStageComplete / hid the bracket).
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/backfill-knockout-round-slot.mjs
 */
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { EVENT_SLOT_MAP } from '../firebase/functions/lib/bracket.js'

if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks' })
const db = getFirestore()

let fixed = 0
for (const [eventId, { round, slot }] of Object.entries(EVENT_SLOT_MAP)) {
  const ref = db.doc(`matches/${eventId}`)
  const snap = await ref.get()
  if (!snap.exists) continue
  const d = snap.data()
  if (d.round === round && d.slot === slot) continue
  await ref.set({ round, slot }, { merge: true })
  console.log(`✓ ${eventId} → ${round}/${slot}`)
  fixed++
}
console.log(`done — ${fixed} doc(s) tagged`)
process.exit(0)
