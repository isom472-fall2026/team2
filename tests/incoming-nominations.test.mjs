import test from 'node:test'
import assert from 'node:assert/strict'
import { preferredNominationId } from '../src/incomingNominations.js'

const nomination = (id, semester, created_at, nomination_status = 'Active') => ({ id, semester, created_at, nomination_status })

test('prefills the newest active nomination for an available cycle', () => {
  const nominations = [
    nomination(10000001, 1, '2026-11-18T12:00:00Z'),
    nomination(10000002, 1, '2026-11-20T12:00:00Z'),
    nomination(10000003, 2, '2026-11-21T12:00:00Z'),
    nomination(10000004, 1, '2026-11-22T12:00:00Z', 'Expired'),
  ]
  assert.equal(preferredNominationId(nominations, [{ id: '1' }], []), '10000002')
})

test('skips nominations and cycles already used by current applications', () => {
  const nominations = [nomination(10000001, 1, '2026-11-20'), nomination(10000002, 2, '2026-11-19')]
  const applications = [{ nomination_id: 10000003, semester_applied_for: '1', application_status: 'Draft' }]
  assert.equal(preferredNominationId(nominations, [{ id: 1 }, { id: 2 }], applications), '10000002')
  applications.push({ nomination_id: '10000002', semester_applied_for: 3, application_status: 'Submitted' })
  assert.equal(preferredNominationId(nominations, [{ id: 1 }, { id: 2 }], applications), '')
})

test('allows reapplication after rejection and ignores historical versions', () => {
  const nominations = [nomination(10000001, 1, '2026-11-20')]
  for (const application_status of ['Rejected', 'Modified']) {
    assert.equal(preferredNominationId(nominations, [{ id: 1 }], [
      { nomination_id: 10000001, semester_applied_for: 1, application_status },
    ]), '10000001')
  }
})

test('leaves the manual field empty without an available nomination', () => {
  assert.equal(preferredNominationId([], [{ id: 1 }], []), '')
  assert.equal(preferredNominationId([nomination(10000001, 1, '2026-11-20')], [], []), '')
})
