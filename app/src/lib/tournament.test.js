// Run with: node --test app/src/lib/tournament.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isGroupStageComplete, GROUP_STAGE_MATCH_COUNT } from './tournament.js'

const post = (round = null) => ({ round, status: { state: 'post' } })
const groupSlate = Array.from({ length: GROUP_STAGE_MATCH_COUNT }, () => post(null))

test('complete when a knockout match has data (even before kickoff)', () => {
  assert.equal(isGroupStageComplete([{ round: 'r32', status: { state: 'pre' } }]), true)
  assert.equal(isGroupStageComplete([post(null), { round: 'r16', status: { state: 'in' } }]), true)
})

test('complete once all 72 group matches are post', () => {
  assert.equal(isGroupStageComplete(groupSlate), true)
  // Extra (untagged) docs can only raise the count — still complete.
  assert.equal(isGroupStageComplete([...groupSlate, post(null)]), true)
})

test('not complete short of 72, or with one group match unfinished', () => {
  assert.equal(isGroupStageComplete(groupSlate.slice(0, 71)), false)
  assert.equal(isGroupStageComplete([...groupSlate.slice(0, 71), { round: null, status: { state: 'in' } }]), false)
  assert.equal(isGroupStageComplete([]), false)
})

test('untagged group matches (no groupLetter) still count via round == null', () => {
  // Production group-match docs lack groupLetter/round; status.state + the
  // null round are all that's needed, so a full untagged slate still completes.
  assert.equal(isGroupStageComplete(groupSlate.map((m) => ({ ...m, groupLetter: undefined }))), true)
})
