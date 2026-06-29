// Run with: node --test app/src/lib/potential.test.js
//
// Guards the "max possible finish" ceiling shown on the leaderboard. The two
// failure modes this protects against, both seen in production:
//   1. a finished group whose `complete` flag / standings lag being treated as
//      still open, which cancels each pick's actual score out of the ceiling and
//      collapses everyone's max to the same constant;
//   2. wildcard points still counting as winnable after the group stage is over
//      (wildcardsFinal stuck false because one straggler group reads unfinished).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  maxPossibleTotal,
  finalizedGroupLetters,
  isWildcardSetFinal,
  knockoutStageReached,
} from './potential.js'
import { GROUPS } from '../data.js'

// gMax=5, wcMax(8 picks)=8, full bracket=80, propMax(non-archived)=9
const SCORING = {
  groupExact: { 1: 1, 2: 1, 3: 1, 4: 1 },
  perfectGroupBonus: 1,
  wildcard: 1,
  knockout: { r32: 1, r16: 2, qf: 4, sf: 8, final: 16 },
  props: [{ id: 'p1', points: 5 }, { id: 'p2', points: 4 }, { id: 'pA', points: 5, archived: true }],
}
const ALL_GROUPS = Object.fromEntries(GROUPS.map((g) => [g, ['a', 'b', 'c', 'd']]))
const FULL_KO = { r32: Array(16).fill('w'), r16: Array(8).fill('w'), qf: Array(4).fill('w'), sf: Array(2).fill('w'), final: ['w'] }
const standings = (gamesPlayed) => ({ entries: [0, 1, 2, 3].map(() => ({ gamesPlayed })) })
const allComplete = Object.fromEntries(GROUPS.map((g) => [g, standings(3)]))
const SB_GROUP = [{ round: null, group: 'Group A' }, { round: null, group: 'Group B' }]
const SB_KO = [{ round: 'r32', group: null }]

test('knockoutStageReached: positive round signal, no-group slate, recorded match', () => {
  assert.equal(knockoutStageReached([{ round: 'r32', group: null }], []), true)
  assert.equal(knockoutStageReached([{ round: null, group: null }], []), true)
  assert.equal(knockoutStageReached([], [{ round: 'r16', status: { state: 'post' } }]), true)
})

test('knockoutStageReached: stays false mid-group-stage and on empty slates', () => {
  assert.equal(knockoutStageReached(SB_GROUP, []), false)
  assert.equal(knockoutStageReached([], []), false)
})

test('finalizedGroupLetters: gamesPlayed, 6-match, and stale-group cases', () => {
  assert.equal(finalizedGroupLetters([], allComplete, SB_GROUP).size, 12)
  const oneStale = { ...allComplete, L: standings(2) }
  assert.equal(finalizedGroupLetters([], oneStale, SB_GROUP).has('L'), false)
  // Knockout reached rescues the straggler group.
  assert.equal(finalizedGroupLetters([], oneStale, SB_KO).has('L'), true)
  // Match-records signal: 6 post matches with the letter.
  assert.equal(finalizedGroupLetters(Array(6).fill({ groupLetter: 'C', status: { state: 'post' } }), {}, SB_GROUP).has('C'), true)
  assert.equal(finalizedGroupLetters(Array(5).fill({ groupLetter: 'C', status: { state: 'post' } }), {}, SB_GROUP).has('C'), false)
})

test('isWildcardSetFinal: needs every group final', () => {
  assert.equal(isWildcardSetFinal(allComplete, finalizedGroupLetters([], allComplete, SB_GROUP)), true)
  const oneStale = { ...allComplete, L: standings(2) }
  assert.equal(isWildcardSetFinal(oneStale, finalizedGroupLetters([], oneStale, SB_GROUP)), false)
})

// Context with the group stage over (knockout reached) — groups + wildcards locked.
function lockedCtx(overrides = {}) {
  const oneStale = { ...allComplete, L: standings(2) }
  const finalizedGroups = finalizedGroupLetters([], oneStale, SB_KO)
  return {
    scoring: SCORING,
    groupsByLetter: oneStale,
    finalizedGroups,
    decidedSlots: new Set(),
    eliminatedTeams: new Set(),
    wildcardsFinal: isWildcardSetFinal(oneStale, finalizedGroups),
    ...overrides,
  }
}

test('missing pick returns null', () => {
  assert.equal(maxPossibleTotal(null, lockedCtx()), null)
})

test('group stage over, no bracket picks: max = score + answered prop upside', () => {
  const pick = { groups: ALL_GROUPS, wildcards: ['A', 'B'], knockout: {}, props: { p1: 'x', p2: 'y' } }
  // 41 already banks the locked groups+wildcards; only the 9 prop pts remain.
  assert.equal(maxPossibleTotal(pick, { total: 41, breakdown: { groups: {}, wildcards: 2, props: 0 }, ...lockedCtx() }), 50)
})

test('props: archived excluded, null counts, unanswered ignored, earned subtracted', () => {
  const base = { groups: ALL_GROUPS, wildcards: [], knockout: {} }
  assert.equal(maxPossibleTotal({ ...base, props: { p1: 'x', p2: 'y', pA: 'z' } }, { total: 41, breakdown: {}, ...lockedCtx() }), 50)
  assert.equal(maxPossibleTotal({ ...base, props: { p1: 'x', p2: null } }, { total: 41, breakdown: {}, ...lockedCtx() }), 50)
  assert.equal(maxPossibleTotal({ ...base, props: { p1: 'x' } }, { total: 41, breakdown: {}, ...lockedCtx() }), 46)
  assert.equal(maxPossibleTotal({ ...base, props: { p1: 'x', p2: 'y' } }, { total: 46, breakdown: { props: 5 }, ...lockedCtx() }), 50)
})

test('knockout: full bracket adds 80; decided slots and eliminated teams add nothing', () => {
  const pick = { groups: ALL_GROUPS, wildcards: [], knockout: FULL_KO, props: {} }
  assert.equal(maxPossibleTotal(pick, { total: 50, breakdown: {}, ...lockedCtx() }), 130)
  assert.equal(maxPossibleTotal(pick, { total: 50, breakdown: {}, ...lockedCtx({ decidedSlots: new Set(['r32_1']) }) }), 129)
  assert.equal(maxPossibleTotal(pick, { total: 50, breakdown: {}, ...lockedCtx({ eliminatedTeams: new Set(['w']) }) }), 50)
})

test('potential equals total once nothing is open', () => {
  const allSlots = new Set()
  for (let i = 1; i <= 16; i++) allSlots.add(`r32_${i}`)
  for (let i = 1; i <= 8; i++) allSlots.add(`r16_${i}`)
  for (let i = 1; i <= 4; i++) allSlots.add(`qf_${i}`)
  for (let i = 1; i <= 2; i++) allSlots.add(`sf_${i}`)
  allSlots.add('final_1')
  const pick = { groups: ALL_GROUPS, wildcards: [], knockout: FULL_KO, props: {} }
  assert.equal(maxPossibleTotal(pick, { total: 99, breakdown: {}, ...lockedCtx({ decidedSlots: allSlots }) }), 99)
})

test('mid-group-stage: only finished groups lock, wildcards stay open', () => {
  // 11 groups done, group L still playing (genuinely, on a group-stage day).
  const mid = { ...allComplete, L: standings(2) }
  const finalizedGroups = finalizedGroupLetters([], mid, SB_GROUP)
  assert.equal(finalizedGroups.size, 11)
  const ctx = {
    scoring: SCORING, groupsByLetter: mid, finalizedGroups,
    decidedSlots: new Set(), eliminatedTeams: new Set(),
    wildcardsFinal: isWildcardSetFinal(mid, finalizedGroups),
  }
  // Group L not final → its full groupMax (5) is still reachable on top of the
  // 8 wildcard pts (set not final) — ceiling is above a fully-locked one.
  const pick = { groups: ALL_GROUPS, wildcards: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], knockout: {}, props: {} }
  const max = maxPossibleTotal(pick, { total: 30, breakdown: { groups: {}, wildcards: 0 }, ...ctx })
  assert.equal(max, 30 + 5 /* group L */ + 8 /* wildcards */)
})
