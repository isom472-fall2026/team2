import test from 'node:test'
import assert from 'node:assert/strict'
import { courseChoiceError, editableCourseStatuses } from '../src/outboundCourseChoices.js'

const custom = { source: 'custom', code: 'FIN 210', title: 'Invented finance course', credits: '3' }

test('catalog and custom courses require their respective identifying fields', () => {
  assert.match(courseChoiceError({ ...custom, source: 'catalog', subjectCode: '' }), /Choose a course/)
  assert.equal(courseChoiceError({ ...custom, source: 'catalog', subjectCode: '1234567', code: '', title: '' }), '')
  assert.match(courseChoiceError({ ...custom, code: '   ' }), /code and title/)
  assert.match(courseChoiceError({ ...custom, title: '' }), /code and title/)
})

test('credits accept positive decimals and reject blank, non-numeric and non-finite values', () => {
  for (const credits of ['', ' ', 'zero', '0', '-3', 'Infinity', 'NaN']) {
    assert.match(courseChoiceError({ ...custom, credits }), /positive number/, credits)
  }
  for (const credits of ['1', '0.5', '3.25']) assert.equal(courseChoiceError({ ...custom, credits }), '')
})

test('only applications awaiting a decision allow course edits', () => {
  for (const status of ['Submitted', 'In Review', 'Pending Interview']) assert.ok(editableCourseStatuses.includes(status))
  for (const status of ['Draft', 'Accepted', 'Approved', 'Rejected', 'Modified', 'Withdrawn']) assert.ok(!editableCourseStatuses.includes(status))
})
