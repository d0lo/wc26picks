import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import logger from 'firebase-functions/logger'
import { fetchScoreboard, fetchSummary } from './lib/espn.js'
import { normalizeEvent, normalizeMatch, parseGroupLetter } from './lib/normalize.js'

initializeApp()
const db = getFirestore()

function utcDateString(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

// Decides whether this tick is worth an ESPN call. Three cases:
//   - a match is already live ("polling" state) — always fetch, the single
//     active chain's regular tick covers every match for the day at once,
//     including any other match that kicks off while this one is still live.
//   - we haven't learned today's schedule yet — fetch once to pick it up
//     (also catches a match already "in" if this is a cold start mid-day).
//   - a cached kickoff time has passed and that match isn't "post" yet —
//     fetch to see if it actually started (handles real-world kickoff delay
//     by simply checking again next minute until it flips to "in"/"post").
function shouldFetch(data, today, now) {
  if (data?.state === 'polling') return true
  if (data?.scheduleDate !== today) return true
  return (data?.kickoffs ?? []).some((k) => k.state !== 'post' && now >= new Date(k.date).getTime())
}

// Runs every minute, all day. Almost every tick is a single cheap Firestore
// read that short-circuits with no ESPN call — the goal is exactly one
// active "polling" chain covering all of today's matches at once, woken by
// the nearest kickoff time and put back to sleep the instant nothing is live.
export const espnPoller = onSchedule({ schedule: '* * * * *', timeZone: 'UTC' }, async () => {
  const scoreboardRef = db.doc('liveData/scoreboard')
  const today = utcDateString(new Date())
  const data = (await scoreboardRef.get()).data()

  if (!shouldFetch(data, today, Date.now())) return

  const raw = await fetchScoreboard()
  const events = (raw.events || []).map(normalizeEvent)
  const state = events.some((e) => e.status.state === 'in') ? 'polling' : 'idle'

  await scoreboardRef.set(
    {
      today,
      scheduleDate: today,
      events,
      hasMatches: events.length > 0,
      kickoffs: events.map((e) => ({ eventId: e.id, date: e.date, state: e.status.state })),
      state,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
})

// Fires on every liveData/scoreboard write. For each match that just
// flipped into "in" or "post", fetches the full ESPN summary and writes the
// match detail + that match's group standings.
export const onScoreboardWrite = onDocumentWritten('liveData/scoreboard', async (event) => {
  const before = event.data?.before?.data()
  const after = event.data?.after?.data()
  if (!after) return

  const beforeById = new Map((before?.events || []).map((e) => [e.id, e]))
  const flipped = (after.events || []).filter((e) => {
    const state = e.status?.state
    if (state !== 'in' && state !== 'post') return false
    const prev = beforeById.get(e.id)
    return !prev || prev.status?.state !== state
  })

  await Promise.all(flipped.map((e) => processMatchUpdate(e.id)))
})

async function processMatchUpdate(eventId) {
  try {
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
  } catch (err) {
    logger.error(`Failed to process match update for event ${eventId}`, err)
  }
}
