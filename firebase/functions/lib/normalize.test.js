import { test } from 'node:test'
import assert from 'node:assert/strict'
import { knockoutRoundSlot, normalizeEvent, normalizeMatch } from './normalize.js'

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

function makeSummary() {
  return {
    header: {
      competitions: [{
        status: { type: { state: 'post', description: 'FT' } },
        competitors: [
          { team: { id: '206' }, score: '2', homeAway: 'home', winner: true },
          { team: { id: '467' }, score: '1', homeAway: 'away', winner: false },
        ],
      }],
    },
    keyEvents: [
      { id: 'g1', scoringPlay: true, team: { id: '206' }, participants: [{ athlete: { displayName: 'Scorer One' } }, { athlete: { displayName: 'Assister One' } }], clock: { displayValue: "23'" }, period: { number: 1 }, shortText: 'Scorer One Goal', goalPositionX: 0.5, goalPositionY: 0.4, fieldPositionX: 0.16, fieldPositionY: 0.5 },
      { id: 'y1', type: { text: 'Yellow Card' }, team: { id: '467' }, participants: [{ athlete: { displayName: 'Booked Player' } }], clock: { displayValue: "40'" }, period: { number: 1 } },
      { id: 'r1', type: { text: 'Red Card' }, team: { id: '467' }, participants: [{ athlete: { displayName: 'Sent Off' } }], clock: { displayValue: "77'" }, period: { number: 2 } },
      { id: 's1', type: { text: 'Substitution' }, team: { id: '206' }, participants: [{ athlete: { displayName: 'Came On' } }, { athlete: { displayName: 'Came Off' } }], clock: { displayValue: "60'" }, period: { number: 2 }, shortText: 'Came On Substitution' },
    ],
    rosters: [
      { team: { id: '206' }, roster: [{ athlete: { id: 'p1', displayName: 'Scorer One' }, starter: true, position: { abbreviation: 'F' }, jersey: '9', stats: [{ name: 'goalAssists', value: 1 }, { name: 'totalGoals', value: 1 }] }] },
      { team: { id: '467' }, roster: [{ athlete: { id: 'gk', displayName: 'Keeper' }, starter: true, position: { abbreviation: 'G' }, jersey: '1', stats: [{ name: 'saves', value: 5 }, { name: 'goalsConceded', value: 2 }] }] },
    ],
    boxscore: { teams: [] },
    standings: {},
  }
}

test('normalizeMatch captures assist + coordinates on scoring plays', () => {
  const m = normalizeMatch(makeSummary())
  assert.equal(m.scoringPlays[0].assist, 'Assister One')
  assert.equal(m.scoringPlays[0].fieldPosition.x, 0.16)
  assert.equal(m.scoringPlays[0].goalPosition.y, 0.4)
})

test('normalizeMatch extracts typed card events', () => {
  const m = normalizeMatch(makeSummary())
  assert.equal(m.cards.length, 2)
  assert.deepEqual(m.cards.map((c) => c.type).sort(), ['red', 'yellow'])
  assert.equal(m.cards.find((c) => c.type === 'yellow').player, 'Booked Player')
})

test('normalizeMatch extracts substitution events with both players', () => {
  const m = normalizeMatch(makeSummary())
  assert.equal(m.substitutions.length, 1)
  assert.deepEqual(m.substitutions[0].players, ['Came On', 'Came Off'])
})

test('normalizeMatch preserves per-player stats as a name→value map', () => {
  const m = normalizeMatch(makeSummary())
  assert.equal(m.rosters[0].players[0].stats.goalAssists, 1)
  assert.equal(m.rosters[1].players[0].stats.saves, 5)
})
