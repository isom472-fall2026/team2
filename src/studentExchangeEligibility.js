export const majors = [
  'Marketing',
  'Management',
  'Public Management',
  'Finance',
  'Accounting',
  'Management Information Systems',
  'Operations Management',
]

export const otherMajor = 'Other'

export function requiresEnglishTestProof(form) {
  return ['IELTS', 'TOEFL iBT'].includes(form.english_test_type)
    && form.english_test_meets_requirement === 'yes'
}

export function needsEnglish106(form) {
  return form.english_test_type === 'None'
    || (['IELTS', 'TOEFL iBT'].includes(form.english_test_type)
      && form.english_test_meets_requirement === 'no')
}

export function isCurrentlyIneligible(form) {
  return needsEnglish106(form) && form.english_106_completed === 'no'
}

export function getAcademicFieldError(field, form, otherMajor = 'Other') {
  const value = String(form[field] ?? '').trim()
  if (field === 'major' && !value) return 'Select a major.'
  if (field === 'major_other' && form.major === otherMajor && !value) return 'Enter your major.'
  if (field === 'current_year_of_study' && !value) return 'Select your current year of study.'
  if (field === 'gpa') {
    if (!value) return 'Enter your GPA.'
    const gpa = Number(value)
    if (!Number.isFinite(gpa) || gpa <= 3 || gpa >= 4) {
      return 'GPA must be greater than 3.0 and less than 4.0.'
    }
  }
  if (field === 'credits_passed') {
    if (!value) return 'Enter your credits passed.'
    const credits = Number(value)
    if (!Number.isInteger(credits) || credits < 60 || credits >= 103) {
      return 'Credits passed must be a whole number from 60 through 102.'
    }
  }
  if (field === 'expected_graduation_semester') {
    if (!value) return 'Select your expected graduation month and year.'
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return 'Enter a valid graduation month and year.'
    const today = new Date()
    const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    if (`${value}-20` <= todayValue) return 'Expected graduation month must be after the 20th of this month.'
  }
  return ''
}

export function getEnglishEligibilityError(form, { requireTestProof = false } = {}) {
  if (!form.english_test_type) return 'Answer whether you have taken IELTS or TOEFL.'
  if (['IELTS', 'TOEFL iBT'].includes(form.english_test_type)) {
    if (!form.english_test_meets_requirement) return 'Answer whether your English test score meets the requirement.'
    if (requireTestProof && requiresEnglishTestProof(form) && !form.language_proficiency) {
      return 'Upload your IELTS or TOEFL score report.'
    }
  }
  if (needsEnglish106(form)) {
    if (!form.english_106_completed) return 'Answer whether you have taken English 106 (course code 9988106).'
    if (isCurrentlyIneligible(form)) return 'You are not currently eligible for the student exchange program.'
  }
  return ''
}
