import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeName, buildPlayerIndex, matchPlayerId, computePropResults } from './props.js'

// ── name matching ──────────────────────────────────────────────────────────

const PLAYERS = [
  { id: 'p-mbappe', name: 'Kylian Mbappé', teamId: 'fra' },
  { id: 'p-son', name: 'Son Heung-Min', teamId: 'kor' },
  { id: 'p-messi', name: 'Lionel Messi', teamId: 'arg' },
  { id: 'p-j-hernandez', name: 'Juan Hernández', teamId: 'mex' },
  { id: 'p-l-hernandez', name: 'Luis Hernández', teamId: 'mex' },
]
const INDEX = buildPlayerIndex(PLAYERS)

test('normalizeName strips diacritics, punctuation, and case', () => {
  assert.equal(normalizeName('Kylian Mbappé'), 'kylian mbappe')
  assert.equal(normalizeName("N'Golo  Kanté"), 'n golo kante')
})

test('matchPlayerId matches accent-insensitively within the team', () => {
  assert.equal(matchPlayerId(INDEX, 'Kylian Mbappe', 'fra'), 'p-mbappe')
})

test('matchPlayerId matches regardless of word order', () => {
  assert.equal(matchPlayerId(INDEX, 'Heung-Min Son', 'kor'), 'p-son')
})

test('matchPlayerId falls back to a unique last name within the team', () => {
  assert.equal(matchPlayerId(INDEX, 'L. Messi', 'arg'), 'p-messi')
})

test('matchPlayerId refuses an ambiguous last name', () => {
  assert.equal(matchPlayerId(INDEX, 'J. Hernandez', 'mex'), null)
})

test('matchPlayerId falls back to a globally-unique exact name when the teamId is unknown', () => {
  assert.equal(matchPlayerId(INDEX, 'Lionel Messi', null), 'p-messi')
})

// ── auto resolvers via computePropResults ──────────────────────────────────

const CATALOG = [
  { id: 'prop-boot', key: 'goldenBoot', type: 'player', points: 5 },
  { id: 'prop-hat', key: 'hatTrickScorer', type: 'player', points: 6 },
  { id: 'prop-goals', key: 'mostGroupGoals', type: 'team', points: 3 },
  { id: 'prop-cards', key: 'mostYellowCards', type: 'team', points: 3 },
  { id: 'prop-assists', key: 'mostAssists', type: 'player', points: 4 },
  { id: 'prop-clean', key: 'cleanGroupTeam', type: 'team', allowNone: true, points: 5 },
  { id: 'prop-ball', key: 'goldenBall', type: 'player', points: 5 }, // no resolver — manual-only
]

function goal(scorer, teamId) {
  return { scorer, teamId }
}

function groupMatch(eventId, letter, aId, aScore, bId, bScore, plays = []) {
  return {
    eventId,
    groupLetter: letter,
    status: { state: 'post' },
    competitors: [
      { teamId: aId, score: String(aScore) },
      { teamId: bId, score: String(bScore) },
    ],
    scoringPlays: plays,
  }
}

test('computePropResults credits all leaders tied at the top (golf-style)', () => {
  const matches = [
    { eventId: 'm1', scoringPlays: [goal('Kylian Mbappé', 'fra'), goal('Kylian Mbappé', 'fra'), goal('Lionel Messi', 'arg')] },
    { eventId: 'm2', scoringPlays: [goal('Lionel Messi', 'arg')] },
  ]
  const results = computePropResults({ catalog: CATALOG, matches, playerIndex: INDEX, groupsComplete: false })
  assert.deepEqual([...results['prop-boot'].winners].sort(), ['p-mbappe', 'p-messi'])
  assert.equal(results['prop-boot'].source, 'auto')
  // both teams tied on 2 goals
  assert.deepEqual([...results['prop-goals'].winners].sort(), ['arg', 'fra'])
})

test('computePropResults surfaces unmatched player names instead of guessing', () => {
  const matches = [{ eventId: 'm1', scoringPlays: [goal('Unknown Striker', 'bra')] }]
  const results = computePropResults({ catalog: CATALOG, matches, playerIndex: INDEX, groupsComplete: false })
  assert.deepEqual(results['prop-boot'].winners, [])
  assert.deepEqual(results['prop-boot'].unmatched, ['Unknown Striker'])
})

test('computePropResults resolves every hat-trick scorer, not just leaders', () => {
  const matches = [
    { eventId: 'm1', scoringPlays: [goal('Kylian Mbappé', 'fra'), goal('Kylian Mbappé', 'fra'), goal('Kylian Mbappé', 'fra')] },
    { eventId: 'm2', scoringPlays: [goal('Lionel Messi', 'arg'), goal('Lionel Messi', 'arg'), goal('Lionel Messi', 'arg'), goal('Lionel Messi', 'arg')] },
    { eventId: 'm3', scoringPlays: [goal('Son Heung-Min', 'kor'), goal('Son Heung-Min', 'kor')] }, // only 2 — no hat trick
  ]
  const results = computePropResults({ catalog: CATALOG, matches, playerIndex: INDEX, groupsComplete: false })
  assert.deepEqual([...results['prop-hat'].winners].sort(), ['p-mbappe', 'p-messi'])
})

test('computePropResults sums assists from roster stats', () => {
  const matches = [
    { eventId: 'm1', rosters: [{ teamId: 'fra', players: [{ playerId: '123', name: 'Kylian Mbappé', stats: { goalAssists: 2 } }] }] },
    { eventId: 'm2', rosters: [{ teamId: 'fra', players: [{ playerId: '123', name: 'Kylian Mbappé', stats: { goalAssists: 1 } }] }, { teamId: 'arg', players: [{ playerId: '456', name: 'Lionel Messi', stats: { goalAssists: 2 } }] }] },
  ]
  const results = computePropResults({ catalog: CATALOG, matches, playerIndex: INDEX, groupsComplete: false })
  assert.deepEqual(results['prop-assists'].winners, ['p-mbappe'])
})

test('computePropResults sums yellow cards from team stats', () => {
  const matches = [
    { eventId: 'm1', teamStats: [{ teamId: 'fra', stats: [{ name: 'yellowCards', displayValue: '3' }] }, { teamId: 'arg', stats: [{ name: 'yellowCards', displayValue: '1' }] }] },
    { eventId: 'm2', teamStats: [{ teamId: 'arg', stats: [{ name: 'yellowCards', displayValue: '1' }] }] },
  ]
  const results = computePropResults({ catalog: CATALOG, matches, playerIndex: INDEX, groupsComplete: false })
  assert.deepEqual(results['prop-cards'].winners, ['fra'])
})

test('cleanGroupTeam only credits teams that finished all 3 group games clean', () => {
  const matches = [
    groupMatch('g1', 'A', 'mex', 1, 'kor', 0),
    groupMatch('g2', 'A', 'mex', 2, 'arg', 0),
    groupMatch('g3', 'A', 'mex', 0, 'fra', 0),
    // fra has kept clean sheets but has only played 1 game — not yet a winner
  ]
  const results = computePropResults({ catalog: CATALOG, matches, playerIndex: INDEX, groupsComplete: false })
  assert.deepEqual(results['prop-clean'].winners, ['mex'])
})

test('cleanGroupTeam resolves to No Team only once the group stage is complete', () => {
  const matches = [groupMatch('g1', 'A', 'mex', 1, 'kor', 1)]
  const inProgress = computePropResults({ catalog: CATALOG, matches, playerIndex: INDEX, groupsComplete: false })
  assert.equal(inProgress['prop-clean'], undefined) // still open — no entry at all
  const complete = computePropResults({ catalog: CATALOG, matches, playerIndex: INDEX, groupsComplete: true })
  assert.equal(complete['prop-clean'].noWinner, true)
  assert.deepEqual(complete['prop-clean'].winners, [])
})

test('computePropResults omits props with nothing decidable yet', () => {
  const results = computePropResults({ catalog: CATALOG, matches: [], playerIndex: INDEX, groupsComplete: false })
  assert.deepEqual(results, {})
})

test('manual overrides win over auto resolution', () => {
  const matches = [{ eventId: 'm1', scoringPlays: [goal('Kylian Mbappé', 'fra')] }]
  const overrides = { 'prop-boot': { winners: ['p-messi'] } }
  const results = computePropResults({ catalog: CATALOG, matches, playerIndex: INDEX, groupsComplete: false, overrides })
  assert.deepEqual(results['prop-boot'], { source: 'manual', winners: ['p-messi'] })
})

test('a manual noWinner override grades the prop as nobody-wins', () => {
  const overrides = { 'prop-clean': { winners: [], noWinner: true } }
  const results = computePropResults({ catalog: CATALOG, matches: [], playerIndex: INDEX, groupsComplete: false, overrides })
  assert.deepEqual(results['prop-clean'], { source: 'manual', winners: [], noWinner: true })
})

test('an empty override is ignored (falls back to auto)', () => {
  const matches = [{ eventId: 'm1', scoringPlays: [goal('Kylian Mbappé', 'fra')] }]
  const overrides = { 'prop-boot': { winners: [] } }
  const results = computePropResults({ catalog: CATALOG, matches, playerIndex: INDEX, groupsComplete: false, overrides })
  assert.deepEqual(results['prop-boot'].winners, ['p-mbappe'])
  assert.equal(results['prop-boot'].source, 'auto')
})

test('props flagged manual in the catalog never auto-resolve', () => {
  const catalog = [{ id: 'prop-boot', key: 'goldenBoot', type: 'player', manual: true, points: 5 }]
  const matches = [{ eventId: 'm1', scoringPlays: [goal('Kylian Mbappé', 'fra')] }]
  const results = computePropResults({ catalog, matches, playerIndex: INDEX, groupsComplete: false })
  assert.equal(results['prop-boot'], undefined)
  // …but a manual override still grades them
  const withOverride = computePropResults({ catalog, matches, playerIndex: INDEX, groupsComplete: false, overrides: { 'prop-boot': { winners: ['p-messi'] } } })
  assert.deepEqual(withOverride['prop-boot'].winners, ['p-messi'])
})

test('archived props get no results entry even with an override', () => {
  const catalog = [{ id: 'prop-boot', key: 'goldenBoot', type: 'player', archived: true, points: 5 }]
  const matches = [{ eventId: 'm1', scoringPlays: [goal('Kylian Mbappé', 'fra')] }]
  const results = computePropResults({ catalog, matches, playerIndex: INDEX, groupsComplete: false, overrides: { 'prop-boot': { winners: ['p-messi'] } } })
  assert.deepEqual(results, {})
})

test('props with no auto resolver (subjective awards) stay ungraded until a manual override', () => {
  const matches = [{ eventId: 'm1', scoringPlays: [goal('Kylian Mbappé', 'fra')] }]
  const results = computePropResults({ catalog: CATALOG, matches, playerIndex: INDEX, groupsComplete: false })
  assert.equal(results['prop-ball'], undefined)
})

test('shootout kicks (period 5) count for no goal tally', () => {
  const matches = [
    { eventId: 'm1', scoringPlays: [
      goal('Lionel Messi', 'arg'),
      { scorer: 'Kylian Mbappé', teamId: 'fra', period: 2 },
      { scorer: 'Kylian Mbappé', teamId: 'fra', period: 5 }, // shootout kick
      { scorer: 'Kylian Mbappé', teamId: 'fra', period: 5 },
    ] },
  ]
  const results = computePropResults({ catalog: CATALOG, matches, playerIndex: INDEX, groupsComplete: false })
  // 1 real goal each — tied, both lead; without the filter Mbappé would be sole leader on 3
  assert.deepEqual([...results['prop-boot'].winners].sort(), ['p-mbappe', 'p-messi'])
  assert.deepEqual([...results['prop-goals'].winners].sort(), ['arg', 'fra'])
  assert.equal(results['prop-hat'], undefined) // 1 goal + 2 shootout kicks is not a hat trick
})

test('own goals count for the benefiting team but never the player', () => {
  const matches = [
    { eventId: 'm1', scoringPlays: [
      { scorer: 'Lionel Messi', teamId: 'arg', period: 1, text: 'Own Goal - Lionel Messi' },
      goal('Kylian Mbappé', 'fra'),
    ] },
  ]
  const results = computePropResults({ catalog: CATALOG, matches, playerIndex: INDEX, groupsComplete: false })
  assert.deepEqual(results['prop-boot'].winners, ['p-mbappe']) // OG excluded from Golden Boot
  assert.deepEqual([...results['prop-goals'].winners].sort(), ['arg', 'fra']) // both teams on 1 goal
})

test('hat-trick tallies fall back to the doc id when eventId is missing', () => {
  // Two different matches missing eventId — 2 goals in each must NOT merge
  // into a phantom 4-goal "hat trick".
  const matches = [
    { id: 'doc1', scoringPlays: [goal('Lionel Messi', 'arg'), goal('Lionel Messi', 'arg')] },
    { id: 'doc2', scoringPlays: [goal('Lionel Messi', 'arg'), goal('Lionel Messi', 'arg')] },
  ]
  const results = computePropResults({ catalog: CATALOG, matches, playerIndex: INDEX, groupsComplete: false })
  assert.equal(results['prop-hat'], undefined)
})
