import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isGroupComplete, isGroupStageComplete, GROUP_MATCH_COUNT, TOTAL_GROUPS } from './tournament.js'

function postMatch() {
  return { status: { state: 'post' } }
}

test('isGroupComplete is true only when all 6 matches have finished', () => {
  const allDone = Array.from({ length: GROUP_MATCH_COUNT }, postMatch)
  assert.equal(isGroupComplete(allDone), true)
})

test('isGroupComplete is false when a match is still pending or in progress', () => {
  const fiveDone = Array.from({ length: GROUP_MATCH_COUNT - 1 }, postMatch)
  fiveDone.push({ status: { state: 'in' } })
  assert.equal(isGroupComplete(fiveDone), false)
})

test('isGroupComplete is false when fewer than 6 matches are known yet', () => {
  const partial = Array.from({ length: 3 }, postMatch)
  assert.equal(isGroupComplete(partial), false)
})

test('isGroupStageComplete requires all 12 groups marked complete', () => {
  const eleven = Array.from({ length: TOTAL_GROUPS - 1 }, () => ({ complete: true }))
  assert.equal(isGroupStageComplete(eleven), false)

  const twelve = Array.from({ length: TOTAL_GROUPS }, () => ({ complete: true }))
  assert.equal(isGroupStageComplete(twelve), true)
})

test('isGroupStageComplete is false if any single group is not yet complete', () => {
  const groups = Array.from({ length: TOTAL_GROUPS }, () => ({ complete: true }))
  groups[5].complete = false
  assert.equal(isGroupStageComplete(groups), false)
})
