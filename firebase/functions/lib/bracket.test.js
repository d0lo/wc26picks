import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ADJACENCY, EVENT_SLOT_MAP, R32_SLOTS, ROUND_SIZE, deriveRoundMatchups } from './bracket.js'

test('R32_SLOTS has 16 slots of 2 distinct teams each', () => {
  assert.equal(R32_SLOTS.length, 16)
  for (const slot of R32_SLOTS) {
    assert.equal(slot.length, 2)
    assert.notEqual(slot[0], slot[1])
  }
})

test('every team UUID across R32_SLOTS is unique (no team appears twice)', () => {
  const allTeams = R32_SLOTS.flat()
  assert.equal(new Set(allTeams).size, allTeams.length)
})

test('ADJACENCY slot numbers are within range and each prev-round slot is used exactly once per round', () => {
  for (const [round, pairs] of Object.entries(ADJACENCY)) {
    const prevSize = round === 'r16' ? 16 : round === 'qf' ? 8 : round === 'sf' || round === 'third' ? 4 : 2
    const used = pairs.flat()
    assert.equal(used.length, new Set(used).size, `${round} reuses a prev-round slot`)
    for (const slot of used) {
      assert.ok(slot >= 1 && slot <= prevSize, `${round} slot ${slot} out of range 1..${prevSize}`)
    }
  }
})

test('deriveRoundMatchups r32 returns the static slots', () => {
  assert.deepEqual(deriveRoundMatchups('r32', null), R32_SLOTS)
})

test('deriveRoundMatchups maps previous winners through ADJACENCY', () => {
  const r32Winners = R32_SLOTS.map((slot) => slot[0]) // pretend team[0] always wins
  const r16 = deriveRoundMatchups('r16', r32Winners)
  assert.equal(r16.length, ROUND_SIZE.r16)
  assert.deepEqual(r16[0], [r32Winners[0], r32Winners[1]]) // ADJACENCY.r16[0] = [1, 2]
})

test('EVENT_SLOT_MAP has exactly one event per slot per round, covering every round', () => {
  const byRound = {}
  for (const { round, slot } of Object.values(EVENT_SLOT_MAP)) {
    byRound[round] = byRound[round] ?? new Set()
    byRound[round].add(slot)
  }
  assert.deepEqual(byRound.r32, new Set(Array.from({ length: 16 }, (_, i) => i + 1)))
  assert.deepEqual(byRound.r16, new Set(Array.from({ length: 8 }, (_, i) => i + 1)))
  assert.deepEqual(byRound.qf, new Set([1, 2, 3, 4]))
  assert.deepEqual(byRound.sf, new Set([1, 2]))
  assert.deepEqual(byRound.third, new Set([1]))
  assert.deepEqual(byRound.final, new Set([1]))
})

test('deriveRoundMatchups returns null placeholders for undecided feeder slots', () => {
  const [a, b] = deriveRoundMatchups('r16', [])[0]
  assert.equal(a, null)
  assert.equal(b, null)
})
