import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { COURSE_CREDITS } from '../courseCredits'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { formatDateTime } from '../dates'
import SubjectFilters from './SubjectFilters'
import './SubjectCatalog.css'
import './IncomingSubjectPreferences.css'

const preferenceFields = 'preferred_subject_codes, subject_preferences_created_at, subject_preferences_updated_at'
const selectionKey = (codes) => JSON.stringify([...codes].sort())

export default function IncomingSubjectPreferences({ profile }) {
  const [subjects, setSubjects] = useState([])
  const [selectedCodes, setSelectedCodes] = useState([])
  const [saved, setSaved] = useState(null)
  const [eligible, setEligible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let current = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [catalog, preferences, access] = await Promise.all([
          supabase.from('subjects')
            .select('course_code, course_display_code, course_name, course_department')
            .order('course_department').order('course_display_code'),
          supabase.from('incomingstudentauth').select(preferenceFields)
            .eq('student_id', profile.student_id).single(),
          supabase.rpc('can_select_incoming_subjects'),
        ])
        const loadError = catalog.error || preferences.error || access.error
        if (loadError) throw loadError
        if (!current) return
        setSubjects(catalog.data || [])
        setSaved(preferences.data)
        setSelectedCodes(preferences.data.preferred_subject_codes)
        setEligible(access.data === true)
      } catch (loadError) {
        if (current) setError(getDatabaseErrorMessage(loadError))
      } finally {
        if (current) setLoading(false)
      }
    }
    load()
    return () => { current = false }
  }, [profile.student_id, reload])

  const changeSelection = (code) => {
    setSelectedCodes((codes) => codes.includes(code)
      ? codes.filter((selected) => selected !== code)
      : [...codes, code])
    setMessage('')
    setError('')
  }

  const save = async (event) => {
    event.preventDefault()
    if (saving || !eligible || selectedCodes.length === 0) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const { data, error: saveError } = await supabase.rpc('save_incoming_subject_preferences', {
        requested_subject_codes: selectedCodes,
      })
      if (saveError) throw saveError
      const preferences = Array.isArray(data) ? data[0] : data
      if (!preferences?.preferred_subject_codes) throw new Error('The preferences were not saved. Please try again.')
      setSaved(preferences)
      setSelectedCodes(preferences.preferred_subject_codes)
      setMessage('Your preferred CBA subjects have been saved.')
    } catch (saveError) {
      setError(getDatabaseErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p role="status">Loading your subject preferences...</p>
  if (!saved) return (
    <section className="subject-preferences" aria-labelledby="subject-preferences-heading">
      <h2 id="subject-preferences-heading">Preferred CBA subjects</h2>
      <p className="auth-form__error" role="alert">{error}</p>
      <button className="btn btn--secondary" type="button" onClick={() => setReload((value) => value + 1)}>Try again</button>
    </section>
  )

  const changed = selectionKey(selectedCodes) !== selectionKey(saved.preferred_subject_codes)
  const subjectByCode = new Map(subjects.map((subject) => [subject.course_code, subject]))

  return (
    <section className="subject-preferences" aria-labelledby="subject-preferences-heading">
      <header>
        <h2 id="subject-preferences-heading">Preferred CBA subjects</h2>
        <p>Choose the courses you would like to register for. Saving preferences does not confirm course registration.</p>
      </header>
      {!eligible && <p className="subject-catalog__locked" role="status">You can choose preferred subjects after your partner institution nominates you or your inbound application is accepted.</p>}
      <form className="subject-preferences__form" onSubmit={save}>
        <section className="subject-preferences__selection" aria-labelledby="preferred-selection-heading">
          <h3 id="preferred-selection-heading">Your selection ({selectedCodes.length})</h3>
          {selectedCodes.length === 0 ? <p>{eligible ? 'Select at least one subject from the catalog below.' : 'No subject preferences saved yet.'}</p> : (
            <ul className="subject-preferences__list">
              {selectedCodes.map((code) => {
                const subject = subjectByCode.get(code)
                return (
                  <li key={code}>
                    <span>
                      <strong>{subject?.course_display_code || code}</strong>{' '}
                      {subject ? (
                        <Link className="subject-catalog__link" to={`/portal/subjects/${code}`} target="_blank" rel="noopener noreferrer" title="View subject details (opens in a new tab)">{subject.course_name}</Link>
                      ) : 'Subject no longer in the catalog'}
                    </span>
                    {eligible && <button className="btn btn--secondary" type="button" disabled={saving} onClick={() => changeSelection(code)} aria-label={`Remove ${subject?.course_display_code || code}`}>Remove</button>}
                  </li>
                )
              })}
            </ul>
          )}
          {saved.subject_preferences_created_at && (
            <dl className="subject-preferences__dates">
              <div><dt>First saved</dt><dd><time dateTime={saved.subject_preferences_created_at}>{formatDateTime(saved.subject_preferences_created_at)}</time></dd></div>
              <div><dt>Last modified</dt><dd><time dateTime={saved.subject_preferences_updated_at}>{formatDateTime(saved.subject_preferences_updated_at)}</time></dd></div>
            </dl>
          )}
          {changed && <p className="subject-preferences__unsaved" role="status">You have unsaved changes.</p>}
          {error && <p className="auth-form__error" role="alert">{error}</p>}
          {message && <p className="subject-preferences__success" role="status">{message}</p>}
          {eligible && <button className="btn btn--primary" type="submit" disabled={saving || selectedCodes.length === 0 || !changed}>{saving ? 'Saving preferences...' : 'Save preferences'}</button>}
        </section>
        {eligible && (
          <section className="subject-preferences__catalog" aria-labelledby="preference-catalog-heading">
            <h3 id="preference-catalog-heading">CBA subject catalog</h3>
            {subjects.length === 0 ? <p>No CBA subjects have been published yet.</p> : (
              <SubjectFilters subjects={subjects}>
                {(matches) => (
                  <div className="subject-catalog__table-wrap">
                    <table className="subject-catalog__table">
                      <thead><tr><th scope="col">Select</th><th scope="col">Code</th><th scope="col">Course</th><th scope="col">Department</th><th scope="col">Credits</th></tr></thead>
                      <tbody lang="en" dir="ltr">
                        {matches.map((subject) => (
                          <tr key={subject.course_code}>
                            <td><input type="checkbox" aria-label={`Select ${subject.course_display_code} ${subject.course_name}`} checked={selectedCodes.includes(subject.course_code)} disabled={saving} onChange={() => changeSelection(subject.course_code)} /></td>
                            <td>{subject.course_display_code}</td>
                            <td><Link className="subject-catalog__link" to={`/portal/subjects/${subject.course_code}`} target="_blank" rel="noopener noreferrer" title="View subject details (opens in a new tab)">{subject.course_name}</Link></td>
                            <td>{subject.course_department}</td>
                            <td>{COURSE_CREDITS}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SubjectFilters>
            )}
          </section>
        )}
      </form>
    </section>
  )
}
