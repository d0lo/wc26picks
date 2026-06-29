import { test } from 'node:test'
import assert from 'node:assert/strict'
import { knockoutRoundSlot, normalizeEvent } from './normalize.js'

function makeEvent(overrides = {}) {
  return {
    id: '760486',
    date: '2026-06-28T19:00Z',
    name: 'Canada at South Africa',
    shortName: 'CAN @ RSA',
    competitions: [
      {
        status: { type: { state: 'pre', description: 'Scheduled', detail: 'Sun' }, displayClock: '0\'' },
        competitors: [
          { team: { id: '206' }, score: null, homeAway: 'away', winner: false },
          { team: { id: '467' }, score: null, homeAway: 'home', winner: false },
        ],
        venue: { fullName: 'SoFi Stadium', address: { city: 'Inglewood', country: 'USA' } },
        altGameNote: null,
      },
    ],
    ...overrides,
  }
}

test('knockoutRoundSlot resolves a known event id to its round/slot', () => {
  // 760486 = Match 73 (South Africa vs Canada) — slot 3 in visual bracket order.
  assert.deepEqual(knockoutRoundSlot('760486'), { round: 'r32', slot: 3 })
  assert.deepEqual(knockoutRoundSlot(760517), { round: 'final', slot: 1 })
})

test('knockoutRoundSlot returns null for a group-stage (unmapped) event id', () => {
  assert.equal(knockoutRoundSlot('123456'), null)
})

test('normalizeEvent tags a knockout match with round/slot and no group', () => {
  const e = normalizeEvent(makeEvent())
  assert.equal(e.round, 'r32')
  assert.equal(e.slot, 3)
  assert.equal(e.group, null)
})

test('normalizeEvent captures the winner flag per competitor', () => {
  const e = normalizeEvent(makeEvent({
    competitions: [{
      status: { type: { state: 'post', description: 'Final', detail: 'FT' }, displayClock: "90'" },
      competitors: [
        { team: { id: '206' }, score: '1', homeAway: 'away', winner: false },
        { team: { id: '467' }, score: '2', homeAway: 'home', winner: true },
      ],
      venue: {},
      altGameNote: null,
    }],
  }))
  assert.equal(e.competitors.find((c) => c.homeAway === 'home').winner, true)
  assert.equal(e.competitors.find((c) => c.homeAway === 'away').winner, false)
})

test('normalizeEvent leaves round/slot null for a group-stage match', () => {
  const e = normalizeEvent(makeEvent({ id: '999999', competitions: [{ ...makeEvent().competitions[0], altGameNote: 'FIFA World Cup, Group A' }] }))
  assert.equal(e.round, null)
  assert.equal(e.group, 'Group A')
})
