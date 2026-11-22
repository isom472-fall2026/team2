import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { getCycles } from '../referenceData'
import { compareCourses, coursesByDay, formatClassTime, semesterDates, semesterName, weekDays } from '../classSchedule'
import ConfirmDialog from './ConfirmDialog'
import './InboundSchedule.css'

const approvedStatuses = ['Accepted', 'Approved']
const scheduleColumns = 'id, application_id, subject_code, course_display_code, course_name, meeting_days, start_time, end_time, room, instructor, updated_at'

// The student and the coordinator download the same PDF; there is nothing to download until a
// course is on the schedule.
function DownloadSchedule({ application, cycle, items }) {
  const [state, setState] = useState({ busy: false, error: '' })
  if (items.length === 0) return null

  const download = async () => {
    setState({ busy: true, error: '' })
    try {
      const { downloadSchedulePdf } = await import('../schedulePdf')
      await downloadSchedulePdf({ application, cycle, items })
      setState({ busy: false, error: '' })
    } catch (error) {
      setState({ busy: false, error: error.message || 'The schedule PDF could not be created.' })
    }
  }

  return (
    <div className="schedule__download">
      <button className="btn btn--secondary" type="button" onClick={download} disabled={state.busy}>
        {state.busy ? 'Preparing PDF…' : 'Download schedule (PDF)'}
      </button>
      {state.error && <p className="auth-form__error" role="alert">{state.error}</p>}
    </div>
  )
}

function CourseSummary({ item, linkSubject }) {
  const title = `${item.course_display_code} · ${item.course_name}`
  return (
    <>
      <span className="schedule__time">
        <time dateTime={item.start_time.slice(0, 5)}>{formatClassTime(item.start_time)}</time>
        {' – '}
        <time dateTime={item.end_time.slice(0, 5)}>{formatClassTime(item.end_time)}</time>
      </span>
      <div className="schedule__details">
        <strong className="schedule__title" dir="auto">
          {linkSubject && item.subject_code
            ? <Link to={`/portal/subjects/${item.subject_code}`} state={{ from: 'schedule' }}>{title}</Link>
            : title}
        </strong>
        <dl className="schedule__facts">
          <div><dt>Days</dt><dd>{item.meeting_days.join(', ')}</dd></div>
          <div><dt>Room</dt><dd dir="auto">{item.room}</dd></div>
          <div><dt>Instructor</dt><dd dir="auto">{item.instructor}</dd></div>
        </dl>
      </div>
    </>
  )
}

function SemesterHeading({ cycle }) {
  return (
    <div className="schedule__semester-heading">
      <h3>{semesterName(cycle)}</h3>
      <p className="schedule__dates">{semesterDates(cycle)}</p>
      <p className="schedule__note">All class times are Kuwait time (Asia/Kuwait, GMT+3).</p>
    </div>
  )
}

function ScheduleByDay({ items }) {
  return (
    <div className="schedule__days">
      {coursesByDay(items).map(({ day, courses }) => (
        <div key={day} className="schedule__day">
          <h4>{day}</h4>
          <ul className="schedule__courses">
            {courses.map((item) => (
              <li key={item.id} className="schedule__course"><CourseSummary item={item} linkSubject /></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function MySchedule({ studentId, onContactOffice }) {
  const [state, setState] = useState({ loading: true, error: '', schedules: [] })

  useEffect(() => {
    let isCurrent = true
    Promise.all([
      supabase
        .from('inboundapplication')
        .select('application_id, student_id, first_name, middle_name, last_name, semester_applied_for')
        .eq('student_id', studentId)
        .in('application_status', approvedStatuses),
      supabase.from('inbound_schedule_items').select(scheduleColumns).eq('student_id', studentId),
      getCycles(),
    ]).then(([applicationsResult, itemsResult, cyclesResult]) => {
      if (!isCurrent) return
      const loadError = applicationsResult.error || itemsResult.error || cyclesResult.error
      if (loadError) {
        setState({ loading: false, error: getDatabaseErrorMessage(loadError), schedules: [] })
        return
      }
      const cycles = new Map(cyclesResult.data.map((cycle) => [cycle.id, cycle]))
      const schedules = (applicationsResult.data || [])
        .map((application) => ({
          application,
          cycle: cycles.get(application.semester_applied_for),
          items: (itemsResult.data || []).filter((item) => item.application_id === application.application_id),
        }))
        .filter(({ items }) => items.length > 0)
        .sort((left, right) => String(right.cycle?.cycle_start ?? '').localeCompare(String(left.cycle?.cycle_start ?? '')))
      setState({ loading: false, error: '', schedules })
    })
    return () => {
      isCurrent = false
    }
  }, [studentId])

  return (
    <section className="schedule" aria-labelledby="my-schedule-heading">
      <h2 id="my-schedule-heading">My schedule</h2>
      {state.loading && <p role="status">Loading your schedule...</p>}
      {state.error && <p className="auth-form__error" role="alert">{state.error}</p>}
      {!state.loading && !state.error && state.schedules.length === 0 && (
        <div className="schedule__empty">
          <p>Your schedule is not available yet.</p>
          <p>
            For questions about your courses,{' '}
            <button className="schedule__link" type="button" onClick={onContactOffice}>Contact the office</button>.
          </p>
        </div>
      )}
      {state.schedules.map(({ application, cycle, items }) => (
        <article key={application.application_id} className="schedule__semester">
          <SemesterHeading cycle={cycle} />
          <DownloadSchedule application={application} cycle={cycle} items={items} />
          <ScheduleByDay items={items} />
        </article>
      ))}
    </section>
  )
}

const emptyCourse = { id: null, source: 'cba', subjectCode: '', code: '', name: '', days: [], start: '', end: '', room: '', instructor: '' }

function courseForm(item) {
  return {
    id: item.id,
    source: item.subject_code ? 'cba' : 'other',
    subjectCode: item.subject_code || '',
    code: item.subject_code ? '' : item.course_display_code,
    name: item.subject_code ? '' : item.course_name,
    days: item.meeting_days,
    start: item.start_time.slice(0, 5),
    end: item.end_time.slice(0, 5),
    room: item.room,
    instructor: item.instructor,
  }
}

function validateCourse(form) {
  if (form.source === 'cba' && !form.subjectCode) return 'Choose a course from the CBA subjects list.'
  if (form.source === 'other' && (!form.code.trim() || !form.name.trim())) return 'Enter the course code and the course name.'
  if (form.days.length === 0) return 'Choose at least one day.'
  if (!form.start || !form.end) return 'Enter the start time and the end time.'
  // Both come from time inputs as HH:MM, so comparing the text compares the times.
  if (form.start >= form.end) return 'The end time must be after the start time.'
  if (!form.room.trim()) return 'Enter the room.'
  if (!form.instructor.trim()) return 'Enter the instructor.'
  return ''
}

function CourseForm({ form, subjects, busy, onChange, onSubmit, onCancel }) {
  const setField = (field) => (event) => onChange({ ...form, [field]: event.target.value })
  const toggleDay = (day) => onChange({
    ...form,
    days: form.days.includes(day) ? form.days.filter((current) => current !== day) : [...form.days, day],
  })

  return (
    <form className="schedule-editor__form" onSubmit={onSubmit} noValidate>
      <h3 className="schedule-editor__wide">{form.id ? 'Edit course' : 'Add a course'}</h3>
      <fieldset className="schedule-editor__wide schedule-editor__group" disabled={busy}>
        <legend>Course</legend>
        <div className="schedule-editor__options">
          <label className="schedule-editor__option">
            <input type="radio" name="course-source" value="cba" checked={form.source === 'cba'} onChange={setField('source')} />
            From the CBA subjects list
          </label>
          <label className="schedule-editor__option">
            <input type="radio" name="course-source" value="other" checked={form.source === 'other'} onChange={setField('source')} />
            Not on the CBA list
          </label>
        </div>
      </fieldset>
      {form.source === 'cba' ? (
        <label className="update-composer__field schedule-editor__wide">
          CBA course
          <select value={form.subjectCode} onChange={setField('subjectCode')} disabled={busy}>
            <option value="">Choose a course</option>
            {subjects.map((subject) => (
              <option key={subject.course_code} value={subject.course_code}>
                {subject.course_display_code} · {subject.course_name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label className="update-composer__field">
            Course code
            <input type="text" maxLength={20} value={form.code} onChange={setField('code')} disabled={busy} dir="auto" />
          </label>
          <label className="update-composer__field">
            Course name
            <input type="text" maxLength={255} value={form.name} onChange={setField('name')} disabled={busy} dir="auto" />
          </label>
        </>
      )}
      <fieldset className="schedule-editor__wide schedule-editor__group" disabled={busy}>
        <legend>Days</legend>
        <div className="schedule-editor__options">
          {weekDays.map((day) => (
            <label key={day} className="schedule-editor__option">
              <input type="checkbox" checked={form.days.includes(day)} onChange={() => toggleDay(day)} />
              {day}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="update-composer__field">
        Start time <span>(Kuwait time)</span>
        <input type="time" value={form.start} onChange={setField('start')} disabled={busy} />
      </label>
      <label className="update-composer__field">
        End time <span>(Kuwait time)</span>
        <input type="time" value={form.end} onChange={setField('end')} disabled={busy} />
      </label>
      <label className="update-composer__field">
        Room
        <input type="text" maxLength={100} value={form.room} onChange={setField('room')} disabled={busy} dir="auto" />
      </label>
      <label className="update-composer__field">
        Instructor
        <input type="text" maxLength={255} value={form.instructor} onChange={setField('instructor')} disabled={busy} dir="auto" />
      </label>
      <div className="nomination-table__actions schedule-editor__wide">
        <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? 'Saving…' : form.id ? 'Save course' : 'Add course'}</button>
        <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  )
}

export default function InboundScheduleEditor({ application, cycles }) {
  const applicationId = application.application_id
  const [items, setItems] = useState([])
  const [subjects, setSubjects] = useState([])
  const [load, setLoad] = useState({ loading: true, error: '' })
  const [form, setForm] = useState(null)
  const [action, setAction] = useState({ busy: false, error: '', message: '' })
  const [pendingRemoval, setPendingRemoval] = useState(null)

  const readItems = useCallback(async () => {
    const { data, error } = await supabase.from('inbound_schedule_items').select(scheduleColumns).eq('application_id', applicationId)
    if (error) throw error
    return data || []
  }, [applicationId])

  useEffect(() => {
    let isCurrent = true
    Promise.all([
      readItems(),
      supabase.from('subjects').select('course_code, course_display_code, course_name').order('course_display_code'),
    ])
      .then(([rows, subjectsResult]) => {
        if (subjectsResult.error) throw subjectsResult.error
        if (!isCurrent) return
        setItems(rows)
        setSubjects(subjectsResult.data || [])
        setLoad({ loading: false, error: '' })
      })
      .catch((error) => {
        if (isCurrent) setLoad({ loading: false, error: getDatabaseErrorMessage(error) })
      })
    return () => {
      isCurrent = false
    }
  }, [readItems])

  const cycle = cycles.find(({ id }) => id === application.semester_applied_for)
  const canEdit = approvedStatuses.includes(application.application_status) && Boolean(application.student_id)
  const sortedItems = [...items].sort(compareCourses)

  const openForm = (next) => {
    setAction({ busy: false, error: '', message: '' })
    setForm(next)
  }

  const saveCourse = async (event) => {
    event.preventDefault()
    const problem = validateCourse(form)
    if (problem) {
      setAction({ busy: false, error: problem, message: '' })
      return
    }
    const subject = form.source === 'cba' ? subjects.find(({ course_code }) => course_code === form.subjectCode) : null
    const row = {
      subject_code: subject ? subject.course_code : null,
      course_display_code: subject ? subject.course_display_code : form.code.trim(),
      course_name: subject ? subject.course_name : form.name.trim(),
      meeting_days: weekDays.filter((day) => form.days.includes(day)),
      start_time: form.start,
      end_time: form.end,
      room: form.room.trim(),
      instructor: form.instructor.trim(),
    }
    setAction({ busy: true, error: '', message: '' })
    try {
      const { data, error } = form.id
        ? await supabase.from('inbound_schedule_items').update(row).eq('id', form.id).select('id')
        : await supabase.from('inbound_schedule_items').insert({ ...row, application_id: applicationId }).select('id')
      if (error) throw error
      // An update the policies refuse matches no row rather than failing.
      if (!data?.length) throw new Error('The course could not be saved. It may have been removed, or the schedule cannot be changed right now.')
      setItems(await readItems())
      setForm(null)
      setAction({ busy: false, error: '', message: 'Course saved. The student sees it the next time they open or reload their schedule.' })
    } catch (error) {
      setAction({ busy: false, error: getDatabaseErrorMessage(error), message: '' })
    }
  }

  const removeCourse = async () => {
    setAction({ busy: true, error: '', message: '' })
    try {
      const { data, error } = await supabase.from('inbound_schedule_items').delete().eq('id', pendingRemoval.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('The course could not be removed. The schedule cannot be changed right now.')
      setItems(await readItems())
      setPendingRemoval(null)
      setAction({ busy: false, error: '', message: 'Course removed from the student’s schedule.' })
    } catch (error) {
      setAction({ busy: false, error: getDatabaseErrorMessage(error), message: '' })
    }
  }

  return (
    <section className="coordinator-review__panel schedule-editor" aria-labelledby="class-schedule-heading">
      <h2 id="class-schedule-heading">Class schedule</h2>
      <SemesterHeading cycle={cycle} />
      {!load.loading && !load.error && <DownloadSchedule application={application} cycle={cycle} items={sortedItems} />}
      {load.loading && <p role="status">Loading the class schedule...</p>}
      {load.error && <p className="auth-form__error" role="alert">{load.error}</p>}
      {!load.loading && !load.error && (
        <>
          {!canEdit && (
            <p>
              {application.student_id
                ? 'A class schedule can be set once the application has conditional or unconditional approval.'
                : 'This application has no student account to receive a class schedule.'}
            </p>
          )}
          {sortedItems.length === 0 ? (
            canEdit && <p>No courses have been added yet. The student sees “Your schedule is not available yet” until you add one.</p>
          ) : (
            <ul className="schedule__courses">
              {sortedItems.map((item) => (
                <li key={item.id} className="schedule__course schedule-editor__course">
                  <CourseSummary item={item} />
                  {canEdit && (
                    <div className="nomination-table__actions schedule-editor__actions">
                      <button className="btn btn--secondary" type="button" disabled={action.busy} onClick={() => openForm(courseForm(item))}>Edit</button>
                      <button className="btn btn--danger" type="button" disabled={action.busy} onClick={() => setPendingRemoval(item)}>Remove</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && !form && (
            <p><button className="btn btn--primary" type="button" onClick={() => openForm(emptyCourse)}>Add a course</button></p>
          )}
          {canEdit && form && (
            <CourseForm
              form={form}
              subjects={subjects}
              busy={action.busy}
              onChange={setForm}
              onSubmit={saveCourse}
              onCancel={() => openForm(null)}
            />
          )}
        </>
      )}
      {action.error && !pendingRemoval && <p className="auth-form__error" role="alert">{action.error}</p>}
      {action.message && <p className="coordinator-review__message" role="status">{action.message}</p>}
      {pendingRemoval && (
        <ConfirmDialog
          id="remove-schedule-course"
          title="Remove this course?"
          error={action.error}
          busy={action.busy}
          confirmLabel="Remove course"
          busyLabel="Removing…"
          onConfirm={removeCourse}
          onCancel={() => {
            setPendingRemoval(null)
            setAction({ busy: false, error: '', message: '' })
          }}
        >
          {pendingRemoval.course_display_code} · {pendingRemoval.course_name} will be removed from the student’s schedule.
        </ConfirmDialog>
      )}
    </section>
  )
}
