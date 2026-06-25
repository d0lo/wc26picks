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

// Runs every minute, 14:00-23:00 UTC (the daily World Cup match window).
// Skips the actual ESPN call once we already know today has no matches, via
// either today's own first poll or yesterday's next-day prefetch.
export const espnScoreboardPoller = onSchedule({ schedule: '* 14-23 * * *', timeZone: 'UTC' }, async () => {
  const scoreboardRef = db.doc('liveData/scoreboard')
  const today = utcDateString(new Date())
  const data = (await scoreboardRef.get()).data()

  if (data?.today === today && data.hasMatches === false) {
    logger.info(`No matches today (${today}) — skipping ESPN poll`)
    return
  }
  if (data?.today !== today && data?.nextDay?.date === today && data.nextDay.hasMatches === false) {
    await scoreboardRef.set(
      { today, events: [], hasMatches: false, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    )
    logger.info(`Prefetch confirmed no matches today (${today}) — skipping ESPN poll`)
    return
  }

  const raw = await fetchScoreboard()
  const events = (raw.events || []).map(normalizeEvent)
  await scoreboardRef.set(
    { today, events, hasMatches: events.length > 0, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  )
})

// Runs once daily, shortly before the match window opens, so tomorrow's
// off-day status (if any) is already known before the poller's first tick.
export const espnNextDayPrefetch = onSchedule({ schedule: '50 13 * * *', timeZone: 'UTC' }, async () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const dateStr = utcDateString(tomorrow)
  const raw = await fetchScoreboard(dateStr)
  const events = raw.events || []
  await db
    .doc('liveData/scoreboard')
    .set({ nextDay: { date: dateStr, hasMatches: events.length > 0 } }, { merge: true })
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

    await db.doc(`liveData/matches/${eventId}`).set(
      { eventId, fetchedAt: FieldValue.serverTimestamp(), ...match },
      { merge: true }
    )

    if (match.groupStandings.length > 0) {
      const groupName = summary.header.competitions[0].competitors[0]?.team?.groups?.name
      const letter = parseGroupLetter(groupName)
      if (letter) {
        await db
          .doc(`liveData/groups/${letter}`)
          .set({ letter, updatedAt: FieldValue.serverTimestamp(), entries: match.groupStandings }, { merge: true })
      }
    }
  } catch (err) {
    logger.error(`Failed to process match update for event ${eventId}`, err)
  }
}
