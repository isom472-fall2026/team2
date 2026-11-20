export const englishEvidenceTypes = ['IELTS', 'TOEFL', 'University letter']

export function inboundApprovalLabel(application) {
  if (['Accepted', 'Approved'].includes(application.application_status)) {
    return application.approval_type === 'Unconditional' ? 'Unconditional approval' : 'Conditional approval'
  }
  return application.application_status || 'Unknown'
}

export function hasConditionalApproval(application) {
  return ['Accepted', 'Approved'].includes(application.application_status)
    && application.approval_type !== 'Unconditional'
}

export function incomingDocumentError(form, files = {}) {
  if (!form.cv && !files.cv) return 'Upload your CV before submitting.'
  return englishEvidenceError(form, files)
}

export function englishEvidenceError(form, files = {}) {
  if (!englishEvidenceTypes.includes(form.english_evidence_type)) return 'Choose IELTS, TOEFL, or a university English-competence letter.'
  if (!form.english_evidence && !files.english_evidence) return 'Upload your English proficiency evidence before submitting.'
  return ''
}
