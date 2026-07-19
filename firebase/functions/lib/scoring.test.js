import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  scoreGroupPrediction,
  scorePropPicks,
  rankThirdPlaceTeams,
  advancingThirdPlaceLetters,
  creditWildcardPicks,
  scorePick,
  sumGroupPoints,
  determineKnockoutWinner,
  scoreKnockoutSlot,
  scoreKnockout,
  sumKnockoutPoints,
} from './scoring.js'

const SCORING = {
  groupExact: { 1: 3, 2: 3, 3: 1, 4: 1 },
  perfectGroupBonus: 1,
  wildcard: 2,
}

function standings(...teamIdsInOrder) {
  return teamIdsInOrder.map((id, i) => ({ team: { id }, points: 9 - i * 3, goalDiff: 4 - i }))
}

test('scoreGroupPrediction awards points per exact position', () => {
  const actual = standings('a', 'b', 'c', 'd')
  const { points, exactPositions } = scoreGroupPrediction(['a', 'c', 'b', 'd'], actual, SCORING)
  assert.equal(exactPositions, 2) // 'a' at 1st, 'd' at 4th
  assert.equal(points, 3 + 1)
})

test('scoreGroupPrediction adds the perfect-group bonus on a full sweep', () => {
  const actual = standings('a', 'b', 'c', 'd')
  const { points, exactPositions } = scoreGroupPrediction(['a', 'b', 'c', 'd'], actual, SCORING)
  assert.equal(exactPositions, 4)
  assert.equal(points, 3 + 3 + 1 + 1 + 1)
})

test('scoreGroupPrediction returns zero with no predictions or standings', () => {
  assert.deepEqual(scoreGroupPrediction(undefined, standings('a', 'b', 'c', 'd'), SCORING), { points: 0, exactPositions: 0 })
  assert.deepEqual(scoreGroupPrediction(['a', 'b', 'c', 'd'], [], SCORING), { points: 0, exactPositions: 0 })
})

test('rankThirdPlaceTeams sorts by points then goal differential', () => {
  const groupsByLetter = {
    A: standings('a1', 'a2', 'a3', 'a4'), // a3: points 3, goalDiff 1
    B: standings('b1', 'b2', 'b3', 'b4'), // b3: points 3, goalDiff 1 (tied with a3)
    C: standings('c1', 'c2', 'c3', 'c4'), // c3: points 3, goalDiff 1
  }
  groupsByLetter.B[2].goalDiff = 5 // make B's 3rd place team rank ahead on goal diff
  const ranked = rankThirdPlaceTeams(groupsByLetter)
  assert.equal(ranked[0].letter, 'B')
})

test('creditWildcardPicks only credits picks in the advancing set with the predicted 3rd-place team', () => {
  const groupsByLetter = {}
  const letters = 'ABCDEFGHIJKL'.split('')
  letters.forEach((letter, i) => {
    // Each group's 3rd place team gets fewer points than the previous group's,
    // so letters A..H are the top 8 (advancing) and I..L are not.
    groupsByLetter[letter] = standings(`${letter}1`, `${letter}2`, `${letter}3`, `${letter}4`)
    groupsByLetter[letter][2].points = 20 - i
  })
  const advancing = advancingThirdPlaceLetters(groupsByLetter)
  // Pick predicts each group's actual 3rd-place team correctly.
  const groups = Object.fromEntries(letters.map((l) => [l, [`${l}1`, `${l}2`, `${l}3`, `${l}4`]]))

  assert.equal(creditWildcardPicks({ groups, wildcards: ['A', 'L'] }, groupsByLetter, advancing, SCORING), 2) // only A advances
  assert.equal(creditWildcardPicks({ groups, wildcards: ['I', 'J'] }, groupsByLetter, advancing, SCORING), 0)
  assert.equal(creditWildcardPicks({ groups, wildcards: [] }, groupsByLetter, advancing, SCORING), 0)
})

test('creditWildcardPicks rejects a wildcard whose predicted 3rd-place team finished elsewhere', () => {
  // Group A's actual 3rd place is 'a3' and it advances, but the user predicted
  // 'a2' to finish 3rd (a2 actually placed 2nd — "made it out of the group").
  // The pick names the right group but the wrong 3rd-place team: no credit.
  const groupsByLetter = { A: standings('a1', 'a2', 'a3', 'a4') }
  const advancing = new Set(['A'])
  const pick = { groups: { A: ['a1', 'a3', 'a2', 'a4'] }, wildcards: ['A'] }
  assert.equal(creditWildcardPicks(pick, groupsByLetter, advancing, SCORING), 0)

  // Same group, but now the predicted 3rd team matches the actual 3rd team.
  const correctPick = { groups: { A: ['a1', 'a2', 'a3', 'a4'] }, wildcards: ['A'] }
  assert.equal(creditWildcardPicks(correctPick, groupsByLetter, advancing, SCORING), 2)
})

test('advancingThirdPlaceLetters returns the same set for an unchanged input (the onGroupsWrite skip case)', () => {
  const groupsByLetter = {
    A: standings('a1', 'a2', 'a3', 'a4'),
    B: standings('b1', 'b2', 'b3', 'b4'),
  }
  const first = [...advancingThirdPlaceLetters(groupsByLetter)].sort()
  const second = [...advancingThirdPlaceLetters(groupsByLetter)].sort()
  assert.deepEqual(first, second)
})

test('scorePick rescores every group with standings, skipping groups with none yet', () => {
  const groupsByLetter = {
    A: standings('a', 'b', 'c', 'd'),
    B: [], // no standings yet — must be skipped, not scored as zero-for-everything
  }
  const pick = { groups: { A: ['a', 'b', 'c', 'd'], B: ['x', 'y', 'z', 'w'] }, wildcards: [] }
  const { groups, wildcards } = scorePick(pick, groupsByLetter, new Set(), SCORING)
  assert.deepEqual(groups, { A: 3 + 3 + 1 + 1 + 1 })
  assert.equal(wildcards, 0)
})

test('scorePick credits wildcards from the passed-in advancing set, not a recomputed one', () => {
  const groupsByLetter = { A: standings('a', 'b', 'c', 'd') }
  const pick = { groups: { A: ['a', 'b', 'c', 'd'] }, wildcards: ['A'] }
  const { wildcards } = scorePick(pick, groupsByLetter, new Set(['A']), SCORING)
  assert.equal(wildcards, 2)
})

test('scorePick reflects updated point values immediately (the retroactive-rescore case)', () => {
  const groupsByLetter = { A: standings('a', 'b', 'c', 'd') }
  const pick = { groups: { A: ['a', 'b', 'c', 'd'] }, wildcards: [] }
  const retuned = { groupExact: { 1: 10, 2: 10, 3: 5, 4: 5 }, perfectGroupBonus: 20 }
  const { groups } = scorePick(pick, groupsByLetter, new Set(), retuned)
  assert.deepEqual(groups, { A: 10 + 10 + 5 + 5 + 20 })
})

test('sumGroupPoints returns null when no group has been scored yet', () => {
  assert.equal(sumGroupPoints({}), null)
  assert.equal(sumGroupPoints(undefined), null)
})

test('sumGroupPoints sums scored groups, including a zero-point group', () => {
  assert.equal(sumGroupPoints({ A: 0, B: 4 }), 4)
})

test('determineKnockoutWinner prefers the winner flag over score comparison', () => {
  const competitors = [
    { teamId: 'a', score: '1', winner: false },
    { teamId: 'b', score: '1', winner: true }, // e.g. won on penalties, level on score
  ]
  assert.equal(determineKnockoutWinner(competitors), 'b')
})

test('determineKnockoutWinner falls back to score comparison when no winner flag is set', () => {
  const competitors = [
    { teamId: 'a', score: '2', winner: false },
    { teamId: 'b', score: '1', winner: false },
  ]
  assert.equal(determineKnockoutWinner(competitors), 'a')
})

test('determineKnockoutWinner returns null when undecided', () => {
  assert.equal(determineKnockoutWinner([{ teamId: 'a', score: '1', winner: false }, { teamId: 'b', score: '1', winner: false }]), null)
  assert.equal(determineKnockoutWinner(undefined), null)
})

test('scoreKnockoutSlot awards the round point value on a correct pick, zero otherwise', () => {
  assert.equal(scoreKnockoutSlot('a', 'a', 'r32'), 1)       // defaults when no config
  assert.equal(scoreKnockoutSlot('a', 'a', 'final'), 16)
  assert.equal(scoreKnockoutSlot('a', 'b', 'r32'), 0)
  assert.equal(scoreKnockoutSlot(null, 'a', 'r32'), 0)
})

test('scoreKnockoutSlot uses config knockout values when provided', () => {
  const scoring = { knockout: { r32: 5, final: 50 } }
  assert.equal(scoreKnockoutSlot('a', 'a', 'r32', scoring), 5)
  assert.equal(scoreKnockoutSlot('a', 'a', 'final', scoring), 50)
  // a round missing from config falls back to the default
  assert.equal(scoreKnockoutSlot('a', 'a', 'qf', scoring), 4)
})

test('scoreKnockout builds the full breakdown from winners + a pick', () => {
  const pick = { r32: ['a', 'x'], r16: ['a'] }
  const koWinners = { r32: { 0: 'a', 1: 'b' }, r16: { 0: 'a' } }
  const out = scoreKnockout(pick, koWinners, { knockout: { r32: 1, r16: 2 } })
  assert.deepEqual(out, { r32: { 0: 1, 1: 0 }, r16: { 0: 2 } })
})

test('sumKnockoutPoints returns null when nothing has been scored yet', () => {
  assert.equal(sumKnockoutPoints({}), null)
  assert.equal(sumKnockoutPoints(undefined), null)
})

test('sumKnockoutPoints sums every scored slot across rounds, including zero-point slots', () => {
  assert.equal(sumKnockoutPoints({ r32: { 0: 1, 1: 0 }, r16: { 0: 2 } }), 3)
})

const PROP_CATALOG = [
  { id: 'p1', key: 'goldenBoot', type: 'player', points: 5 },
  { id: 'p2', key: 'mostGroupGoals', type: 'team', points: 3 },
  { id: 'p3', key: 'cleanGroupTeam', type: 'team', allowNone: true, points: 5 },
  { id: 'p4', key: 'oldProp', type: 'team', points: 9, archived: true },
]

test('scorePropPicks credits picks matching a resolved winner', () => {
  const results = { p1: { winners: ['player-a', 'player-b'] }, p2: { winners: ['team-x'] } }
  const pick = { p1: 'player-b', p2: 'team-y', p3: null }
  assert.equal(scorePropPicks(pick, PROP_CATALOG, results), 5)
})

test('scorePropPicks credits a null pick only via noWinner', () => {
  const noneWins = { p3: { winners: [], noWinner: true } }
  assert.equal(scorePropPicks({ p3: null }, PROP_CATALOG, noneWins), 5)
  assert.equal(scorePropPicks({ p3: 'team-x' }, PROP_CATALOG, noneWins), 0)
  const teamWins = { p3: { winners: ['team-x'] } }
  assert.equal(scorePropPicks({ p3: null }, PROP_CATALOG, teamWins), 0)
})

test('scorePropPicks treats an unresolved entry (no winners, no noWinner) as pending', () => {
  const results = { p1: { winners: [], unmatched: ['Somebody'] } }
  assert.equal(scorePropPicks({ p1: 'player-a' }, PROP_CATALOG, results), 0)
})

test('scorePropPicks ignores archived props and unanswered picks', () => {
  const results = { p4: { winners: ['team-x'] }, p1: { winners: ['player-a'] } }
  assert.equal(scorePropPicks({ p4: 'team-x' }, PROP_CATALOG, results), 0) // archived
  assert.equal(scorePropPicks({}, PROP_CATALOG, results), 0)               // never answered
  assert.equal(scorePropPicks(undefined, PROP_CATALOG, results), 0)        // knockout-only pick doc
})

test('scorePropPicks treats an entry with unmatched leader names as pending even when other winners matched', () => {
  // The unmatched name may be a tied co-leader — nobody scores until the
  // admin resolves it, so pickers of the unmatched player are not marked wrong.
  const results = { p1: { winners: ['player-a'], unmatched: ['Somebody Else'] } }
  assert.equal(scorePropPicks({ p1: 'player-a' }, PROP_CATALOG, results), 0)
})

test('scorePropPicks noWinner credits null picks only on allowNone props', () => {
  // p1 has no allowNone — a legacy null (prop saved as unanswered) must not
  // score when the admin grades the prop as nobody-wins.
  const results = { p1: { winners: [], noWinner: true } }
  assert.equal(scorePropPicks({ p1: null }, PROP_CATALOG, results), 0)
})
