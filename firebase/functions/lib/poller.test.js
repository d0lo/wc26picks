import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moreProgressed, todaysKickoffs, shouldFetch, mergeFetchedKickoffs, WAKE_WINDOW_MS } from './poller.js'

test('moreProgressed never regresses a known state', () => {
  assert.equal(moreProgressed('pre', 'in'), 'in')
  assert.equal(moreProgressed('in', 'pre'), 'in')
  assert.equal(moreProgressed('post', 'in'), 'post')
  assert.equal(moreProgressed('post', 'pre'), 'post')
})

const SCHED = [
  { id: '1', date: '2026-06-28T16:00:00Z', status: { state: 'post' } }, // group, finished
  { id: '2', date: '2026-06-28T19:00:00Z', status: { state: 'in' } },   // R32, kicked off later
  { id: '3', date: '2026-06-29T17:00:00Z', status: { state: 'pre' } },  // tomorrow
]

test('todaysKickoffs keeps only today and merges sticky prior states', () => {
  const prior = { scheduleDate: '20260628', kickoffs: [{ eventId: '2', date: '2026-06-28T19:00:00Z', state: 'post' }] }
  const ks = todaysKickoffs(SCHED, prior, '20260628')
  assert.deepEqual(ks.map((k) => k.eventId).sort(), ['1', '2'])
  assert.equal(ks.find((k) => k.eventId === '2').state, 'post') // prior post wins over schedule's 'in'
})

test('shouldFetch wakes for a later game even after earlier ones are post (the deadlock fix)', () => {
  // Stored state: group game finished, idle — the old bug slept here.
  const data = { state: 'idle', scheduleDate: '20260628', kickoffs: [{ eventId: '1', date: '2026-06-28T16:00:00Z', state: 'post' }] }
  const now = Date.parse('2026-06-28T21:00:00Z') // after R32 kickoff (19:00)
  const kickoffs = todaysKickoffs(SCHED, data, '20260628')
  assert.equal(shouldFetch(data, '20260628', now, kickoffs), true)
})

test('shouldFetch sleeps once every today game is post', () => {
  const data = { state: 'idle', scheduleDate: '20260628' }
  const sched = SCHED.map((e) => (e.id === '2' ? { ...e, status: { state: 'post' } } : e))
  const now = Date.parse('2026-06-28T22:00:00Z')
  assert.equal(shouldFetch(data, '20260628', now, todaysKickoffs(sched, data, '20260628')), false)
})

test('shouldFetch ignores a game far past kickoff (assumed finished)', () => {
  const data = { state: 'idle', scheduleDate: '20260628' }
  const stale = [{ id: '9', date: '2026-06-28T01:00:00Z', status: { state: 'pre' } }]
  const now = Date.parse('2026-06-28T01:00:00Z') + WAKE_WINDOW_MS + 1
  assert.equal(shouldFetch(data, '20260628', now, todaysKickoffs(stale, data, '20260628')), false)
})

test('mergeFetchedKickoffs adds fetched events not in the schedule-derived ledger', () => {
  const kickoffs = [{ eventId: '1', date: '2026-06-28T16:00:00Z', state: 'post' }]
  // Event '2' is live in ESPN but absent from the ledger (schedule missing it).
  const events = [{ id: '2', date: '2026-06-28T19:00:00Z', status: { state: 'in' } }]
  const merged = mergeFetchedKickoffs(kickoffs, events)
  assert.equal(merged.length, 2)
  assert.equal(merged.find((k) => k.eventId === '2').state, 'in')
})

test('mergeFetchedKickoffs keeps a tracked game ESPN dropped, advancing state only forward', () => {
  const kickoffs = [{ eventId: '1', date: '2026-06-28T16:00:00Z', state: 'post' }]
  const merged = mergeFetchedKickoffs(kickoffs, []) // ESPN dropped event 1
  assert.equal(merged.find((k) => k.eventId === '1').state, 'post') // sticky
})

test('shouldFetch always wakes on a new day and while polling', () => {
  assert.equal(shouldFetch({ scheduleDate: '20260627' }, '20260628', Date.now(), []), true)
  assert.equal(shouldFetch({ state: 'polling', scheduleDate: '20260628' }, '20260628', Date.now(), []), true)
})
