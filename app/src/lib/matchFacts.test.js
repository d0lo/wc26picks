// Run with: node --test app/src/lib/matchFacts.test.js
//
// Guards liveScoreSplitCandidates — the client-only "1–0 past 70′ right now"
// watch derived purely from the streaming scoreboard events[] (score + clock).
// The detailed matches/{eventId} doc with goal minutes is stale mid-match, so
// these tests pin the scoreboard-only rules: regulation, 70'+, exactly 1–0.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { liveScoreSplitCandidates } from './matchFacts.js'

function makeEvent(overrides = {}) {
  return {
    id: 'e1',
    status: { state: 'in', displayClock: "73'", period: 2 },
    competitors: [
      { teamId: 'home', name: 'Home', score: '1' },
      { teamId: 'away', name: 'Away', score: '0' },
    ],
    ...overrides,
  }
}

test('flags an in-progress 1–0 game past 70′', () => {
  const c = liveScoreSplitCandidates([makeEvent()])
  assert.equal(c.length, 1)
  assert.deepEqual(c[0].scores, [1, 0])
  assert.equal(c[0].minute, 73)
  assert.equal(c[0].displayClock, "73'")
})

test('a 0–1 scoreline (either side leading by one) still qualifies', () => {
  const c = liveScoreSplitCandidates([
    makeEvent({ competitors: [
      { teamId: 'home', name: 'Home', score: '0' },
      { teamId: 'away', name: 'Away', score: '1' },
    ] }),
  ])
  assert.equal(c.length, 1)
  assert.deepEqual(c[0].scores, [0, 1])
})

test('excludes games before the 70′ mark', () => {
  assert.equal(liveScoreSplitCandidates([makeEvent({ status: { state: 'in', displayClock: "69'", period: 2 } })]).length, 0)
})

test('includes a game exactly at 70′', () => {
  assert.equal(liveScoreSplitCandidates([makeEvent({ status: { state: 'in', displayClock: "70'", period: 2 } })]).length, 1)
})

test('excludes non-1–0 scorelines (0–0, 1–1, 2–0)', () => {
  const drawnLevel = makeEvent({ competitors: [
    { teamId: 'home', name: 'Home', score: '1' },
    { teamId: 'away', name: 'Away', score: '1' },
  ] })
  const goalless = makeEvent({ competitors: [
    { teamId: 'home', name: 'Home', score: '0' },
    { teamId: 'away', name: 'Away', score: '0' },
  ] })
  const twoNil = makeEvent({ competitors: [
    { teamId: 'home', name: 'Home', score: '2' },
    { teamId: 'away', name: 'Away', score: '0' },
  ] })
  assert.equal(liveScoreSplitCandidates([drawnLevel, goalless, twoNil]).length, 0)
})

test('excludes games not in the "in" state', () => {
  assert.equal(liveScoreSplitCandidates([makeEvent({ status: { state: 'pre', displayClock: "0'", period: 1 } })]).length, 0)
  assert.equal(liveScoreSplitCandidates([makeEvent({ status: { state: 'post', displayClock: "90'", period: 2 } })]).length, 0)
})

test('excludes extra time / shootout (period beyond regulation)', () => {
  assert.equal(liveScoreSplitCandidates([makeEvent({ status: { state: 'in', displayClock: "105'", period: 3 } })]).length, 0)
})

test('handles stoppage-time clocks like 90′+4′ via the base minute', () => {
  assert.equal(liveScoreSplitCandidates([makeEvent({ status: { state: 'in', displayClock: "90'+4'", period: 2 } })]).length, 1)
})

test('ignores malformed events (missing/!=2 competitors) without throwing', () => {
  assert.equal(liveScoreSplitCandidates([{ id: 'x', status: { state: 'in', displayClock: "80'", period: 2 } }]).length, 0)
  assert.equal(liveScoreSplitCandidates([]).length, 0)
  assert.equal(liveScoreSplitCandidates(null).length, 0)
})
