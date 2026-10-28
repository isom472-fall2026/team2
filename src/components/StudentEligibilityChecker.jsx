import { useState } from 'react'
import DateField from './DateField'
import {
  getAcademicFieldError,
  getEnglishEligibilityError,
  majors,
  otherMajor,
} from '../studentExchangeEligibility'

const initialForm = {
  major: '',
  major_other: '',
  current_year_of_study: '',
  gpa: '',
  credits_passed: '',
  expected_graduation_semester: '',
  english_test_type: '',
  english_test_meets_requirement: '',
  english_106_completed: '',
}

export default function StudentEligibilityChecker() {
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setError('')
    setResult('')
  }

  const submit = (event) => {
    event.preventDefault()
    const academicFields = [
      'major',
      ...(form.major === otherMajor ? ['major_other'] : []),
      'current_year_of_study',
      'gpa',
      'credits_passed',
      'expected_graduation_semester',
    ]
    const academicError = academicFields
      .map((field) => getAcademicFieldError(field, form))
      .find(Boolean)
    const eligibilityError = academicError || getEnglishEligibilityError(form)

    if (eligibilityError) {
      setError(eligibilityError)
      setResult('')
      return
    }

    setError('')
    setResult('Your answers meet the current academic eligibility criteria. Final eligibility is subject to review by Kuwait University.')
  }

  const hasEnglishTest = ['IELTS', 'TOEFL iBT'].includes(form.english_test_type)
  const needsEnglish106 = form.english_test_type === 'None'
    || (hasEnglishTest && form.english_test_meets_requirement === 'no')

  return (
    <form className="exchange-checker" onSubmit={submit} noValidate>
      <div className="exchange-checker__grid">
        <label>
          Major
          <select name="major" value={form.major} onChange={updateField}>
            <option value="">Select your major</option>
            {majors.map((major) => <option key={major} value={major}>{major}</option>)}
            <option value={otherMajor}>{otherMajor}</option>
          </select>
        </label>
        {form.major === otherMajor && (
          <label>
            Specify your major
            <input name="major_other" value={form.major_other} onChange={updateField} autoComplete="off" />
          </label>
        )}
        <label>
          Current year of study
          <select name="current_year_of_study" value={form.current_year_of_study} onChange={updateField}>
            <option value="">Select your year</option>
            <option value="Second year">Second year</option>
            <option value="Third year">Third year</option>
            <option value="Fourth year">Fourth year</option>
          </select>
        </label>
        <label>
          Current GPA
          <input name="gpa" type="number" min="3" max="4" step="any" value={form.gpa} onChange={updateField} />
          <span>Must be greater than 3.0 and no higher than 4.0.</span>
        </label>
        <label>
          Credits passed
          <input name="credits_passed" type="number" min="60" max="102" step="1" value={form.credits_passed} onChange={updateField} />
          <span>Enter a whole number from 60 through 102.</span>
        </label>
        <label>
          Expected graduation month and year
          <DateField name="expected_graduation_semester" type="month" value={form.expected_graduation_semester} onChange={updateField} />
        </label>
        <label>
          English proficiency test
          <select name="english_test_type" value={form.english_test_type} onChange={updateField}>
            <option value="">Choose an answer</option>
            <option value="IELTS">IELTS</option>
            <option value="TOEFL iBT">TOEFL iBT</option>
            <option value="None">Neither</option>
          </select>
        </label>
        {hasEnglishTest && (
          <label>
            Does your score meet the requirement?
            <span className="exchange-checker__hint">
              IELTS greater than 6.0 or TOEFL iBT at least 60.
            </span>
            <select name="english_test_meets_requirement" value={form.english_test_meets_requirement} onChange={updateField}>
              <option value="">Choose an answer</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        )}
        {needsEnglish106 && (
          <label>
            Have you completed English 106 (course code 9988106)?
            <select name="english_106_completed" value={form.english_106_completed} onChange={updateField}>
              <option value="">Choose an answer</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        )}
      </div>
      <button className="exchange-checker__submit" type="submit">Check eligibility</button>
      {error && <p className="exchange-checker__message exchange-checker__message--error" role="alert">{error}</p>}
      {result && <p className="exchange-checker__message exchange-checker__message--success" role="status">{result}</p>}
    </form>
  )
}
