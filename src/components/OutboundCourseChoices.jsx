import { useEffect, useId, useState } from 'react'
import { supabase } from '../supabase'
import { COURSE_CREDITS } from '../courseCredits'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { courseChoiceError, editableCourseStatuses, maxCourseChoices } from '../outboundCourseChoices'
import './OutboundCourseChoices.css'

const emptyForm = { id: null, source: 'catalog', subjectCode: '', code: '', title: '', credits: String(COURSE_CREDITS) }

function CourseIcon({ locked = false }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={locked ? 'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4M12 14v3' : 'M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1m0-15c4-3 8-2 10-1v15c-4-2-7-1-10 1V5Z'} /></svg>
}

export default function OutboundCourseChoices({ application, readOnly = false }) {
  const id = useId()
  const applicationId = application.application_id
  const [courses, setCourses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [status, setStatus] = useState(application.application_status)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(false)
  const [load, setLoad] = useState({ loading: true, error: '' })
  const [action, setAction] = useState({ busy: false, error: '', message: '' })
  const canEdit = !readOnly && editableCourseStatuses.includes(status)
  const atLimit = courses.length >= maxCourseChoices
  const totalCredits = courses.reduce((total, course) => total + Number(course.credits), 0)
  const needle = search.toLowerCase().replace(/\s+/g, '')
  const matches = subjects.filter((subject) => subject.course_code === form.subjectCode || `${subject.course_display_code}${subject.course_name}`.toLowerCase().replace(/\s+/g, '').includes(needle))

  useEffect(() => {
    let current = true
    Promise.all([
      supabase.from('outbound_course_choices').select('*').eq('application_id', applicationId).order('id'),
      readOnly ? Promise.resolve({ data: [] }) : supabase.from('subjects').select('course_code, course_display_code, course_name').order('course_display_code'),
      supabase.from('outboundapplication').select('application_status').eq('application_id', applicationId).single(),
    ]).then(([choicesResult, subjectsResult, applicationResult]) => {
      if (!current) return
      const error = choicesResult.error || subjectsResult.error || applicationResult.error
      setLoad({ loading: false, error: error ? getDatabaseErrorMessage(error) : '' })
      if (error) return
      setCourses(choicesResult.data || [])
      setSubjects(subjectsResult.data || [])
      setStatus(applicationResult.data.application_status)
    })
    const channel = supabase.channel(`outbound-courses-${applicationId}-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'outboundapplication', filter: `application_id=eq.${applicationId}` }, ({ new: row }) => {
        if (current && row.application_status) setStatus(row.application_status)
      }).subscribe()
    return () => { current = false; supabase.removeChannel(channel) }
  }, [applicationId, application.application_status, id, readOnly])

  const reset = () => { setForm(emptyForm); setSearch(''); setEditing(false) }
  const field = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }))
  const refreshStatus = async () => {
    const { data } = await supabase.from('outboundapplication').select('application_status').eq('application_id', applicationId).single()
    if (data) setStatus(data.application_status)
  }

  const save = async (event) => {
    event.preventDefault()
    const validation = courseChoiceError(form)
    if (validation) { setAction({ busy: false, error: validation, message: '' }); return }
    setAction({ busy: true, error: '', message: '' })
    const { data, error } = await supabase.rpc('save_outbound_course_choice', {
      requested_application_id: applicationId,
      requested_choice_id: form.id,
      requested_subject_code: form.source === 'catalog' ? form.subjectCode : null,
      requested_course_code: form.source === 'custom' ? form.code.trim() : null,
      requested_course_title: form.source === 'custom' ? form.title.trim() : null,
      requested_credits: Number(form.credits),
    })
    if (error) {
      await refreshStatus()
      setAction({ busy: false, error: getDatabaseErrorMessage(error), message: '' })
      return
    }
    setCourses((current) => form.id ? current.map((course) => course.id === data.id ? data : course) : [...current, data])
    reset()
    setAction({ busy: false, error: '', message: 'Course saved.' })
  }

  const remove = async (course) => {
    setAction({ busy: true, error: '', message: '' })
    const { error } = await supabase.rpc('delete_outbound_course_choice', { requested_application_id: applicationId, requested_choice_id: course.id })
    if (error) {
      await refreshStatus()
      setAction({ busy: false, error: getDatabaseErrorMessage(error), message: '' })
      return
    }
    setCourses((current) => current.filter(({ id: courseId }) => courseId !== course.id))
    if (form.id === course.id) reset()
    setAction({ busy: false, error: '', message: 'Course removed.' })
  }

  return (
    <section className="course-choices" aria-labelledby={`${id}-heading`}>
      <header className="course-choices__header">
        <span className="course-choices__icon"><CourseIcon /></span>
        <div><span className="course-choices__eyebrow">Plan your exchange</span><h2 id={`${id}-heading`}>KU course list</h2><p>List the KU courses for the office to review when coordinating your studies abroad.</p></div>
      </header>
      {load.loading && <p role="status">Loading courses…</p>}
      {load.error && <p className="auth-form__error" role="alert">{load.error}</p>}
      {!load.loading && !load.error && <>
        <div className="course-choices__summary"><span><strong>{courses.length}</strong> / {maxCourseChoices} courses</span><span><strong>{Number(totalCredits.toFixed(4))}</strong> total credits</span></div>
        {!canEdit && <p className="course-choices__notice"><CourseIcon locked />{['Accepted', 'Approved'].includes(status) ? 'Application approved. Your course list is now read-only.' : readOnly ? 'The student can update this list until the application is approved.' : 'This list is read-only while the application is not awaiting a decision.'}</p>}
        {courses.length === 0 ? <p className="course-choices__empty">{canEdit ? 'Start with a KU catalog course, or add a course by its code and title.' : 'No courses have been listed.'}</p> : (
          <ol className="course-choices__list">{courses.map((course, index) => <li key={course.id}>
            <span className="course-choices__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <div className="course-choices__course"><strong dir="auto">{course.course_display_code}</strong><span dir="auto">{course.course_title}</span><small>{course.subject_code ? 'KU catalog' : 'Custom course'} · {course.credits} credits</small></div>
            {canEdit && <div className="course-choices__actions"><button className="btn btn--secondary" type="button" disabled={action.busy} onClick={() => { setForm({ id: course.id, source: course.subject_code ? 'catalog' : 'custom', subjectCode: course.subject_code || '', code: course.course_display_code, title: course.course_title, credits: String(course.credits) }); setSearch(''); setEditing(true); setAction({ busy: false, error: '', message: '' }) }} aria-label={`Edit ${course.course_display_code}`}>Edit</button><button className="course-choices__remove" type="button" disabled={action.busy} onClick={() => remove(course)} aria-label={`Remove ${course.course_display_code}`}>Remove</button></div>}
          </li>)}</ol>
        )}
        {canEdit && !editing && <button className="btn btn--primary" type="button" disabled={atLimit || action.busy} onClick={() => { reset(); setEditing(true); setAction({ busy: false, error: '', message: '' }) }}>{atLimit ? '8-course limit reached' : '+ Add course'}</button>}
        {canEdit && editing && <form className="course-choices__form" onSubmit={save} noValidate>
          <h3>{form.id ? 'Edit course' : 'Add a course'}</h3>
          <fieldset disabled={action.busy}>
            <legend>Course source</legend>
            <div className="course-choices__sources">{[['catalog', 'KU catalog'], ['custom', 'Custom course']].map(([source, label]) => <label key={source}><input type="radio" name={`${id}-source`} value={source} checked={form.source === source} onChange={field('source')} />{label}</label>)}</div>
            {form.source === 'catalog' ? <>
              <label>Find a course<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by code or title" /></label>
              <label>KU course<select value={form.subjectCode} onChange={field('subjectCode')} required><option value="">Choose a course</option>{matches.map((subject) => <option key={subject.course_code} value={subject.course_code}>{subject.course_display_code} · {subject.course_name}</option>)}</select></label>
              {matches.length === 0 && <p>No catalog courses match. Try another search or use Custom course.</p>}
            </> : <div className="course-choices__custom"><label>Course code<input value={form.code} onChange={field('code')} maxLength={30} required dir="auto" /></label><label>Course title<input value={form.title} onChange={field('title')} maxLength={255} required dir="auto" /></label></div>}
            <label>Credits<input type="text" inputMode="decimal" value={form.credits} onChange={field('credits')} required aria-describedby={`${id}-credits-help`} /></label>
            <p id={`${id}-credits-help`} className="course-choices__hint">Use a positive number. You can edit your choices until application approval.</p>
          </fieldset>
          <div className="course-choices__actions"><button className="btn btn--primary" type="submit" disabled={action.busy}>{action.busy ? 'Saving…' : 'Save course'}</button><button className="btn btn--secondary" type="button" onClick={reset} disabled={action.busy}>Cancel</button></div>
        </form>}
      </>}
      {action.error && <p className="auth-form__error" role="alert">{action.error}</p>}
      {action.message && <p className="course-choices__message" role="status">{action.message}</p>}
    </section>
  )
}
