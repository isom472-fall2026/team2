import test from 'node:test'
import assert from 'node:assert/strict'
import { englishEvidenceError, incomingDocumentError, inboundApprovalLabel, hasConditionalApproval } from '../src/inboundApproval.js'

test('legacy acceptances remain conditional until the embassy certificate is verified', () => {
  for (const application_status of ['Accepted', 'Approved']) {
    assert.equal(inboundApprovalLabel({ application_status }), 'Conditional approval')
    assert.equal(hasConditionalApproval({ application_status }), true)
  }
  assert.equal(inboundApprovalLabel({ application_status: 'Approved', approval_type: 'Unconditional' }), 'Unconditional approval')
  assert.equal(hasConditionalApproval({ application_status: 'Approved', approval_type: 'Unconditional' }), false)
  assert.equal(hasConditionalApproval({ application_status: 'Submitted' }), false)
})

test('a CV and an accepted English evidence category with a file are required', () => {
  assert.match(incomingDocumentError({}), /CV/)
  assert.match(incomingDocumentError({ cv: 'cv.pdf' }), /Choose IELTS/)
  assert.match(englishEvidenceError({ english_evidence_type: 'Other', english_evidence: 'proof.pdf' }), /Choose IELTS/)
  assert.match(englishEvidenceError({ english_evidence_type: 'IELTS' }), /Upload/)
  for (const english_evidence_type of ['IELTS', 'TOEFL', 'University letter']) {
    assert.equal(incomingDocumentError({ cv: 'cv.pdf', english_evidence_type, english_evidence: 'proof.pdf' }), '')
    assert.equal(incomingDocumentError({ english_evidence_type }, { cv: {}, english_evidence: {} }), '')
  }
})

test('a criminal-record certificate is optional at submission', () => {
  assert.equal(incomingDocumentError({ cv: 'cv.pdf', english_evidence_type: 'University letter', english_evidence: 'letter.pdf' }), '')
})
