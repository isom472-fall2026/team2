export const maxCourseChoices = 8
export const editableCourseStatuses = ['Submitted', 'In Review', 'Pending Interview']

export function courseChoiceError(form) {
  if (form.source === 'catalog' && !form.subjectCode) return 'Choose a course from the KU catalog.'
  if (form.source === 'custom' && (!form.code.trim() || !form.title.trim())) return 'Enter both the course code and title.'
  if (!String(form.credits).trim() || !Number.isFinite(Number(form.credits)) || Number(form.credits) <= 0) {
    return 'Enter credits as a positive number.'
  }
  return ''
}
