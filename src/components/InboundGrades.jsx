import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { getCycles } from '../referenceData'
import { compareCourses, semesterName } from '../classSchedule'
import { formatPoints, gradePoints, gradeScale, isPassingGrade, lowestPassingGrade, semesterGpa } from '../kuGrades'
import './InboundGrades.css'

const approvedStatuses = ['Accepted', 'Approved']
const courseColumns = 'id, application_id, course_display_code, course_name, credit_hours, meeting_days, start_time'

function withGrades(items, grades) {
  const letters = new Map(grades.map(({ schedule_item_id: id, letter_grade: letter }) => [id, letter]))
  return items.map((item) => ({ ...item, letter_grade: letters.get(item.id) ?? null })).sort(compareCourses)
}

function GradeScaleTable() {
  return (
    <table className="grades__scale">
      <caption>KU letter grades on the 4.0 scale</caption>
      <thead>
        <tr>
          <th scope="col">Letter grade</th>
          <th scope="col">Grade points</th>
          <th scope="col">Result</th>
        </tr>
      </thead>
      <tbody>
        {gradeScale.map(({ letter, points }) => (
          <tr key={letter} className={letter === lowestPassingGrade ? 'grades__scale-row--lowest' : undefined}>
            <th scope="row">{letter}</th>
            <td>{formatPoints(points)}</td>
            <td>{letter === lowestPassingGrade ? 'Pass, the lowest passing grade' : isPassingGrade(letter) ? 'Pass' : 'Fail'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function GradesExplained({ onContactOffice }) {
  return (
    <div className="grades__explained">
      <p>Kuwait University gives each course a letter grade, and each letter is worth a number of grade points on a 4.0 scale.</p>
      <GradeScaleTable />
      <p><strong>{lowestPassingGrade} is the lowest passing grade.</strong> An F is a failing grade.</p>

      <h3>How your semester GPA is calculated</h3>
      <ol className="grades__steps">
        <li>Multiply each course’s grade points by its credit hours.</li>
        <li>Add those results together.</li>
        <li>Divide the total by the credit hours of the graded courses.</li>
      </ol>
      <p className="grades__example">
        For example, an A (4.00) in a 3-credit course and a B (3.00) in a 3-credit course give
        (4.00 × 3 + 3.00 × 3) ÷ 6 = 3.50. A course that has not been graded yet is left out until it is.
      </p>

      <h3>Transferring your grades</h3>
      <p>
        Your home university decides how KU grades transfer to your degree, including how they convert to its own
        grading scale. For questions about your KU grades,{' '}
        <button className="grades__link" type="button" onClick={onContactOffice}>Contact the office</button>.
      </p>
    </div>
  )
}

function DownloadGrades({ application, cycle, courses }) {
  const [state, setState] = useState({ busy: false, error: '' })
  const allGraded = courses.length > 0 && courses.every(({ letter_grade: letter }) => gradePoints(letter) !== undefined)
  if (!allGraded) return <p className="grades__note">You can download your grades as a PDF once every course has a grade.</p>

  const download = async () => {
    setState({ busy: true, error: '' })
    try {
      const { downloadGradesPdf } = await import('../gradesPdf')
      await downloadGradesPdf({ application, cycle, courses })
      setState({ busy: false, error: '' })
    } catch (error) {
      setState({ busy: false, error: error.message || 'The grades PDF could not be created.' })
    }
  }

  return (
    <div className="grades__download">
      <button className="btn btn--secondary" type="button" onClick={download} disabled={state.busy}>
        {state.busy ? 'Preparing PDF…' : 'Download grades (PDF)'}
      </button>
      {state.error && <p className="auth-form__error" role="alert">{state.error}</p>}
    </div>
  )
}

function GpaLine({ courses }) {
  const result = semesterGpa(courses)
  if (!result) return null
  const ungraded = courses.length - result.graded
  return (
    <div className="grades__gpa">
      <p>Semester GPA <strong>{formatPoints(result.gpa)}</strong> <span>on {result.credits} graded credit hours</span></p>
      {ungraded > 0 && <p className="grades__note">{ungraded === 1 ? 'One course is' : `${ungraded} courses are`} not graded yet and left out of the GPA.</p>}
    </div>
  )
}

function CourseGrade({ course }) {
  return (
    <>
      <div className="grades__course-name">
        <strong dir="auto">{course.course_display_code} · {course.course_name}</strong>
        <span>{course.credit_hours} credit hours</span>
      </div>
      <div className="grades__result">
        {course.letter_grade ? (
          <>
            <strong className="grades__letter">{course.letter_grade}</strong>
            <span>{formatPoints(gradePoints(course.letter_grade))} grade points</span>
          </>
        ) : <span className="grades__pending">Not graded yet</span>}
      </div>
    </>
  )
}

function SemesterGrades({ application, cycle, courses }) {
  const graded = courses.filter(({ letter_grade: letter }) => letter).length
  return (
    <article className="grades__semester">
      <h3>{semesterName(cycle)}</h3>
      {graded === 0 ? (
        <>
          <p className="grades__empty">No grades have been recorded yet.</p>
          <GradeScaleTable />
        </>
      ) : (
        <>
          <ul className="grades__courses">
            {courses.map((course) => <li key={course.id} className="grades__course"><CourseGrade course={course} /></li>)}
          </ul>
          <GpaLine courses={courses} />
          <DownloadGrades application={application} cycle={cycle} courses={courses} />
        </>
      )}
    </article>
  )
}

export function MyGrades({ studentId, onContactOffice }) {
  const [state, setState] = useState({ loading: true, error: '', semesters: [] })
  const [view, setView] = useState('scale')

  useEffect(() => {
    let isCurrent = true
    Promise.all([
      supabase
        .from('inboundapplication')
        .select('application_id, student_id, first_name, middle_name, last_name, semester_applied_for')
        .eq('student_id', studentId)
        .in('application_status', approvedStatuses),
      supabase.from('inbound_schedule_items').select(courseColumns).eq('student_id', studentId),
      supabase.from('acceptance_letters').select('application_id').eq('student_id', studentId).not('stamped_file_path', 'is', null),
      supabase.from('inbound_course_grades').select('schedule_item_id, letter_grade').eq('student_id', studentId),
      getCycles(),
    ]).then(([applicationsResult, itemsResult, lettersResult, gradesResult, cyclesResult]) => {
      if (!isCurrent) return
      const loadError = [applicationsResult, itemsResult, lettersResult, gradesResult, cyclesResult].find(({ error }) => error)?.error
      if (loadError) {
        setState({ loading: false, error: getDatabaseErrorMessage(loadError), semesters: [] })
        return
      }
      // Grades open per application once its stamped acceptance letter has reached the student.
      const lettered = new Set((lettersResult.data || []).map(({ application_id: id }) => id))
      const cycles = new Map(cyclesResult.data.map((cycle) => [cycle.id, cycle]))
      const semesters = (applicationsResult.data || [])
        .filter(({ application_id: id }) => lettered.has(id))
        .map((application) => ({
          application,
          cycle: cycles.get(application.semester_applied_for),
          courses: withGrades((itemsResult.data || []).filter((item) => item.application_id === application.application_id), gradesResult.data || []),
        }))
        .sort((leftSemester, rightSemester) => String(rightSemester.cycle?.cycle_start ?? '').localeCompare(String(leftSemester.cycle?.cycle_start ?? '')))
      setState({ loading: false, error: '', semesters })
    })
    return () => {
      isCurrent = false
    }
  }, [studentId])

  const canSeeGrades = !state.loading && !state.error && state.semesters.length > 0
  const shownView = canSeeGrades ? view : 'scale'

  return (
    <section className="grades" aria-labelledby="grades-heading">
      <h2 id="grades-heading">Grades</h2>
      <div className="grades__tabs" role="tablist" aria-label="Grades sections">
        <button
          id="grades-tab-scale"
          className={`grades__tab${shownView === 'scale' ? ' grades__tab--active' : ''}`}
          type="button"
          role="tab"
          aria-selected={shownView === 'scale'}
          aria-controls="grades-panel"
          onClick={() => setView('scale')}
        >
          How KU grades work
        </button>
        <button
          id="grades-tab-mine"
          className={`grades__tab${shownView === 'mine' ? ' grades__tab--active' : ''}`}
          type="button"
          role="tab"
          aria-selected={shownView === 'mine'}
          aria-controls="grades-panel"
          aria-describedby={canSeeGrades ? undefined : 'grades-locked'}
          disabled={!canSeeGrades}
          onClick={() => setView('mine')}
        >
          My grades
        </button>
      </div>
      {state.loading && <p role="status">Loading your grades...</p>}
      {state.error && <p className="auth-form__error" role="alert">{state.error}</p>}
      {!state.loading && !state.error && !canSeeGrades && (
        <p id="grades-locked" className="grades__locked">
          My grades opens once Kuwait University has sent you your stamped acceptance letter.
        </p>
      )}
      <div id="grades-panel" role="tabpanel" aria-labelledby={`grades-tab-${shownView}`}>
        {shownView === 'scale'
          ? <GradesExplained onContactOffice={onContactOffice} />
          : state.semesters.map(({ application, cycle, courses }) => (
            <SemesterGrades key={application.application_id} application={application} cycle={cycle} courses={courses} />
          ))}
      </div>
    </section>
  )
}

export default function InboundGradesEditor({ application, cycles }) {
  const applicationId = application.application_id
  const [items, setItems] = useState([])
  const [grades, setGrades] = useState([])
  const [letterSent, setLetterSent] = useState(false)
  const [selection, setSelection] = useState({})
  const [load, setLoad] = useState({ loading: true, error: '' })
  const [action, setAction] = useState({ busy: false, error: '', message: '' })

  const readGrades = useCallback(async () => {
    const { data, error } = await supabase.from('inbound_course_grades').select('schedule_item_id, letter_grade').eq('application_id', applicationId)
    if (error) throw error
    return data || []
  }, [applicationId])

  useEffect(() => {
    let isCurrent = true
    Promise.all([
      supabase.from('inbound_schedule_items').select(courseColumns).eq('application_id', applicationId),
      readGrades(),
      supabase.from('acceptance_letters').select('id').eq('application_id', applicationId).not('stamped_file_path', 'is', null),
    ])
      .then(([itemsResult, gradeRows, lettersResult]) => {
        if (itemsResult.error) throw itemsResult.error
        if (lettersResult.error) throw lettersResult.error
        if (!isCurrent) return
        setItems(itemsResult.data || [])
        setGrades(gradeRows)
        setSelection(Object.fromEntries(gradeRows.map(({ schedule_item_id: id, letter_grade: letter }) => [id, letter])))
        setLetterSent((lettersResult.data || []).length > 0)
        setLoad({ loading: false, error: '' })
      })
      .catch((error) => {
        if (isCurrent) setLoad({ loading: false, error: getDatabaseErrorMessage(error) })
      })
    return () => {
      isCurrent = false
    }
  }, [applicationId, readGrades])

  const cycle = cycles.find(({ id }) => id === application.semester_applied_for)
  const canEdit = approvedStatuses.includes(application.application_status) && Boolean(application.student_id)
  const saved = Object.fromEntries(grades.map(({ schedule_item_id: id, letter_grade: letter }) => [id, letter]))
  const courses = withGrades(items, Object.entries(selection).filter(([, letter]) => letter).map(([id, letter]) => ({ schedule_item_id: Number(id), letter_grade: letter })))
  const changes = items.filter(({ id }) => (selection[id] || '') !== (saved[id] || ''))

  const saveGrades = async (event) => {
    event.preventDefault()
    setAction({ busy: true, error: '', message: '' })
    try {
      const results = await Promise.all(changes.map(({ id }) => {
        const letter = selection[id] || ''
        const table = supabase.from('inbound_course_grades')
        if (!letter) return table.delete().eq('schedule_item_id', id).select('schedule_item_id')
        if (saved[id]) return table.update({ letter_grade: letter }).eq('schedule_item_id', id).select('schedule_item_id')
        return table.insert({ schedule_item_id: id, letter_grade: letter }).select('schedule_item_id')
      }))
      const failed = results.find(({ error }) => error)
      const gradeRows = await readGrades()
      setGrades(gradeRows)
      setSelection(Object.fromEntries(gradeRows.map(({ schedule_item_id: id, letter_grade: letter }) => [id, letter])))
      if (failed) throw failed.error
      // A change the policies refuse matches no row rather than failing.
      if (results.some(({ data }) => !data?.length)) throw new Error('Some grades could not be saved. The grades cannot be changed right now.')
      setAction({ busy: false, error: '', message: 'Grades saved. The student sees them the next time they open or reload their grades.' })
    } catch (error) {
      setAction({ busy: false, error: getDatabaseErrorMessage(error), message: '' })
    }
  }

  return (
    <section className="coordinator-review__panel grades-editor" aria-labelledby="grades-editor-heading">
      <h2 id="grades-editor-heading">Grades</h2>
      <p className="grades-editor__semester">{semesterName(cycle)} · grades on KU’s 4.0 scale</p>
      {load.loading && <p role="status">Loading grades...</p>}
      {load.error && <p className="auth-form__error" role="alert">{load.error}</p>}
      {!load.loading && !load.error && (
        <>
          {!canEdit && (
            <p>
              {application.student_id
                ? 'Grades can be recorded once the application has conditional or unconditional approval.'
                : 'This application has no student account to receive grades.'}
            </p>
          )}
          {canEdit && items.length === 0 && <p>Add courses in the Class schedule tab before recording grades.</p>}
          {items.length > 0 && (
            <form onSubmit={saveGrades}>
              <ul className="grades__courses">
                {courses.map((course) => (
                  <li key={course.id} className="grades__course">
                    <div className="grades__course-name">
                      <strong dir="auto">{course.course_display_code} · {course.course_name}</strong>
                      <span>{course.credit_hours} credit hours</span>
                    </div>
                    <label className="grades-editor__grade">
                      <span className="grades__sr-only">Grade for {course.course_display_code}</span>
                      <select
                        value={selection[course.id] || ''}
                        onChange={(event) => setSelection((current) => ({ ...current, [course.id]: event.target.value }))}
                        disabled={!canEdit || action.busy}
                      >
                        <option value="">Not graded yet</option>
                        {gradeScale.map(({ letter, points }) => (
                          <option key={letter} value={letter}>{letter} ({formatPoints(points)})</option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
              <GpaLine courses={courses} />
              {canEdit && (
                <div className="nomination-table__actions">
                  <button className="btn btn--primary" type="submit" disabled={action.busy || changes.length === 0}>
                    {action.busy ? 'Saving…' : 'Save grades'}
                  </button>
                  {changes.length > 0 && !action.busy && (
                    <button className="btn btn--secondary" type="button" onClick={() => setSelection(saved)}>Discard changes</button>
                  )}
                </div>
              )}
            </form>
          )}
          {items.length > 0 && !letterSent && (
            <p className="grades-editor__hint">
              The student sees these grades once their stamped acceptance letter has been sent from the Acceptance letter tab.
            </p>
          )}
        </>
      )}
      {action.error && <p className="auth-form__error" role="alert">{action.error}</p>}
      {action.message && <p className="coordinator-review__message" role="status">{action.message}</p>}
    </section>
  )
}
