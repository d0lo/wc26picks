import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreGroupPrediction, rankThirdPlaceTeams, scoreWildcardPicks, scorePick } from './scoring.js'

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

test('scoreWildcardPicks only credits picks among the best 8 third-place finishers', () => {
  const groupsByLetter = {}
  const letters = 'ABCDEFGHIJKL'.split('')
  letters.forEach((letter, i) => {
    // Each group's 3rd place team gets fewer points than the previous group's,
    // so letters A..H are the top 8 (advancing) and I..L are not.
    groupsByLetter[letter] = standings(`${letter}1`, `${letter}2`, `${letter}3`, `${letter}4`)
    groupsByLetter[letter][2].points = 20 - i
  })

  assert.equal(scoreWildcardPicks(['A', 'L'], groupsByLetter, SCORING), 2) // only A advances
  assert.equal(scoreWildcardPicks(['I', 'J'], groupsByLetter, SCORING), 0)
  assert.equal(scoreWildcardPicks([], groupsByLetter, SCORING), 0)
})

test('scorePick rescores every group with standings, skipping groups with none yet', () => {
  const groupsByLetter = {
    A: standings('a', 'b', 'c', 'd'),
    B: [], // no standings yet — must be skipped, not scored as zero-for-everything
  }
  const pick = { groups: { A: ['a', 'b', 'c', 'd'], B: ['x', 'y', 'z', 'w'] }, wildcards: [] }
  const { groups, wildcards } = scorePick(pick, groupsByLetter, SCORING)
  assert.deepEqual(groups, { A: 3 + 3 + 1 + 1 + 1 })
  assert.equal(wildcards, 0)
})

test('scorePick reflects updated point values immediately (the retroactive-rescore case)', () => {
  const groupsByLetter = { A: standings('a', 'b', 'c', 'd') }
  const pick = { groups: { A: ['a', 'b', 'c', 'd'] }, wildcards: [] }
  const retuned = { groupExact: { 1: 10, 2: 10, 3: 5, 4: 5 }, perfectGroupBonus: 20 }
  const { groups } = scorePick(pick, groupsByLetter, retuned)
  assert.deepEqual(groups, { A: 10 + 10 + 5 + 5 + 20 })
})
