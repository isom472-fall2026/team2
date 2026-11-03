import { useState } from 'react'
import { getAcademicFieldError } from '../studentExchangeEligibility'

const initialForm = {
  current_year_of_study: '',
  gpa: '',
  credits_passed: '',
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
      'current_year_of_study',
      'gpa',
      'credits_passed',
    ]
    const academicError = academicFields
      .map((field) => getAcademicFieldError(field, form))
      .find(Boolean)

    if (academicError) {
      setError(academicError)
      setResult('')
      return
    }

    setError('')
    setResult('Your answers meet the current academic eligibility criteria. Final eligibility is subject to review by Kuwait University.')
  }

  return (
    <form className="exchange-checker" onSubmit={submit} noValidate>
      <div className="exchange-checker__grid">
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
      </div>
      <button className="exchange-checker__submit" type="submit">Check eligibility</button>
      {error && <p className="exchange-checker__message exchange-checker__message--error" role="alert">{error}</p>}
      {result && <p className="exchange-checker__message exchange-checker__message--success" role="status">{result}</p>}
    </form>
  )
}
