import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { COURSE_CREDITS } from '../courseCredits'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { useAppStore } from '../stores/appStore'
import { supabase } from '../supabase'
import SubjectFilters from './SubjectFilters'
import './SubjectCatalog.css'

const SYLLABUS_BUCKET = 'syllabi'

function SubjectCatalogPage({ children, labelledBy }) {
  return (
    <section className="portal-page subject-catalog" aria-labelledby={labelledBy}>
      <div className="portal-card portal-card--wide subject-catalog__card">{children}</div>
    </section>
  )
}

function SubjectCatalog() {
  const [subjects, setSubjects] = useState([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCurrent = true
    supabase
      .from('subjects')
      .select('course_code, course_display_code, course_name, course_department')
      .order('course_department')
      .order('course_display_code')
      .then(({ data, error: loadError }) => {
        if (!isCurrent) return
        setError(loadError ? getDatabaseErrorMessage(loadError) : '')
        setSubjects(data ?? [])
        setIsLoading(false)
      })
    return () => {
      isCurrent = false
    }
  }, [])

  return (
    <SubjectCatalogPage labelledBy="subject-catalog-heading">
      <Link className="subject-catalog__back" to="/portal">← Back to portal</Link>
      <span className="auth-card__eyebrow">College of Business Administration</span>
      <h1 id="subject-catalog-heading">CBA subjects</h1>
      <p>The courses Kuwait University's College of Business Administration offers. Open a course to read its description and learning outcomes.</p>

      {error && <p className="auth-form__error" role="alert">{error}</p>}
      {isLoading && <p role="status">Loading subjects...</p>}
      {!isLoading && !error && subjects.length === 0 && <p>No subjects have been published yet.</p>}
      {subjects.length > 0 && (
        <SubjectFilters subjects={subjects}>
          {(matches) => (
            <div className="subject-catalog__table-wrap">
              <table className="subject-catalog__table">
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Course</th>
                    <th scope="col">Department</th>
                    <th scope="col">Credits</th>
                  </tr>
                </thead>
                <tbody lang="en" dir="ltr">
                  {matches.map((subject) => (
                    <tr key={subject.course_code}>
                      <td>
                        <Link className="subject-catalog__link" to={`/portal/subjects/${subject.course_code}`}>
                          {subject.course_display_code}
                        </Link>
                      </td>
                      <td>
                        <Link className="subject-catalog__link" to={`/portal/subjects/${subject.course_code}`}>
                          {subject.course_name}
                        </Link>
                      </td>
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
    </SubjectCatalogPage>
  )
}

export function SubjectDetail() {
  const { courseCode } = useParams()
  const isCoordinator = useAppStore((state) => state.profile?.role === 'coordinator')
  const [subject, setSubject] = useState(null)
  const [canDownload, setCanDownload] = useState(false)
  const [error, setError] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCurrent = true
    Promise.all([
      supabase
        .from('subjects')
        .select('course_code, course_display_code, course_name, course_department, course_description, course_clos, course_syllabus')
        .eq('course_code', courseCode)
        .maybeSingle(),
      supabase.rpc('can_download_syllabi'),
    ]).then(([subjectResult, accessResult]) => {
      if (!isCurrent) return
      const loadError = subjectResult.error ?? accessResult.error
      setError(loadError ? getDatabaseErrorMessage(loadError) : '')
      setSubject(subjectResult.data ?? null)
      setCanDownload(accessResult.data === true)
      setIsLoading(false)
    })
    return () => {
      isCurrent = false
    }
  }, [courseCode])

  const downloadSyllabus = async () => {
    setDownloadError('')
    const { data, error: urlError } = await supabase.storage
      .from(SYLLABUS_BUCKET)
      .createSignedUrl(subject.course_syllabus, 60)
    if (urlError) {
      setDownloadError(`Could not open the syllabus: ${urlError.message}`)
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const backLink = isCoordinator
    ? <Link className="subject-catalog__back" to="/portal" state={{ view: 'subjects' }}>← Back to CBA subjects</Link>
    : <Link className="subject-catalog__back" to="/portal/subjects">← All subjects</Link>

  if (isLoading) {
    return <SubjectCatalogPage>{backLink}<p role="status">Loading subject...</p></SubjectCatalogPage>
  }

  if (!subject) {
    return (
      <SubjectCatalogPage labelledBy="subject-detail-heading">
        {backLink}
        <h1 id="subject-detail-heading">Subject not found</h1>
        {error
          ? <p className="auth-form__error" role="alert">{error}</p>
          : <p>There is no CBA subject with this code.</p>}
      </SubjectCatalogPage>
    )
  }

  return (
    <SubjectCatalogPage labelledBy="subject-detail-heading">
      {backLink}
      <div lang="en" dir="ltr" className="subject-catalog__detail">
        <span className="auth-card__eyebrow">{subject.course_department}</span>
        <h1 id="subject-detail-heading">{subject.course_display_code} · {subject.course_name}</h1>
        <p className="subject-catalog__credits">{COURSE_CREDITS} credits</p>

        <h2>Course description</h2>
        {subject.course_description
          ? <p className="subject-catalog__description">{subject.course_description}</p>
          : <p>No description available.</p>}

        <h2>Course learning outcomes</h2>
        {subject.course_clos?.length > 0 ? (
          <ol className="subject-catalog__clos">
            {subject.course_clos.map((clo, index) => <li key={index}>{clo}</li>)}
          </ol>
        ) : <p>No learning outcomes available.</p>}

        <h2>Syllabus</h2>
        {error && <p className="auth-form__error" role="alert">{error}</p>}
        {!subject.course_syllabus ? (
          <p>Syllabus not available</p>
        ) : canDownload ? (
          <button className="btn btn--primary" type="button" onClick={downloadSyllabus}>Download the syllabus</button>
        ) : (
          <p className="subject-catalog__locked">
            You must be nominated by your partner institution, or have your application accepted, to download this syllabus.
          </p>
        )}
        {downloadError && <p className="auth-form__error" role="alert">{downloadError}</p>}
      </div>
    </SubjectCatalogPage>
  )
}

export default SubjectCatalog
