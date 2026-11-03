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

export function getAcademicFieldError(field, form, otherMajor = 'Other') {
  const value = String(form[field] ?? '').trim()
  if (field === 'major' && !value) return 'Select a major.'
  if (field === 'major_other' && form.major === otherMajor && !value) return 'Enter your major.'
  if (field === 'current_year_of_study' && !value) return 'Select your current year of study.'
  if (field === 'gpa') {
    if (!value) return 'Enter your GPA.'
    const gpa = Number(value)
    if (!Number.isFinite(gpa) || gpa <= 3 || gpa > 4) {
      return 'GPA must be greater than 3.0 and no higher than 4.0.'
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
