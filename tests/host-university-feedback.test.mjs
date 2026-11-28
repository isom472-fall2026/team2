import test from 'node:test'
import assert from 'node:assert/strict'
import { approvedStatuses, ratingError, semesterHasEnded } from '../src/hostUniversityFeedback.js'

test('a rating is required and must be a whole number from 1 to 5', () => {
  for (const value of ['', '  ', null, undefined]) assert.match(ratingError(value), /Choose a rating/, String(value))
  for (const value of ['0', '6', '-1', '3.5', 'five', '100']) assert.match(ratingError(value), /whole number from 1 to 5/, value)
  for (const value of ['1', '3', '5', ' 4 ']) assert.equal(ratingError(value), '', value)
})

test('feedback opens only after the KU semester has ended', () => {
  const now = new Date('2027-06-01T12:00:00Z')
  assert.equal(semesterHasEnded({ cycle_end: '2027-05-31T12:00:00+00:00' }, now), true)
  assert.equal(semesterHasEnded({ cycle_end: '2027-06-02T12:00:00+00:00' }, now), false)
  assert.equal(semesterHasEnded({ cycle_end: null }, now), false)
  assert.equal(semesterHasEnded(undefined, now), false)
})

test('Accepted and Approved both count as an approved outbound application', () => {
  for (const status of ['Accepted', 'Approved']) assert.ok(approvedStatuses.includes(status))
  for (const status of ['Draft', 'Submitted', 'In Review', 'Pending Interview', 'Rejected', 'Withdrawn', 'Modified']) {
    assert.ok(!approvedStatuses.includes(status), status)
  }
})
