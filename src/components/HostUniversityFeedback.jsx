import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { getCycles, getPartnerUniversities } from '../referenceData'
import { formatDate } from '../dates'
import { approvedStatuses, ratingError, semesterHasEnded } from '../hostUniversityFeedback'
import './HostUniversityFeedback.css'

const feedbackColumns = 'id, oapplicationid, rating, details, created_at'
const duplicateMessage = 'You have already rated this university for this application. Each application can be rated once.'

function Stars({ rating }) {
  return (
    <span className="host-feedback__rating">
      <span className="host-feedback__stars" aria-hidden="true">
        {'★'.repeat(rating)}
        <span className="host-feedback__stars-empty">{'★'.repeat(5 - rating)}</span>
      </span>
      <span>{rating} out of 5</span>
    </span>
  )
}

function cycleLabel(cycle) {
  return cycle ? `${cycle.semester} ${cycle.academic_year}` : ''
}

async function readOwnFeedback(studentId) {
  const [applicationsResult, cyclesResult, universitiesResult] = await Promise.all([
    supabase
      .from('outboundapplication')
      .select('application_id, university_id, semester_applied_for')
      .eq('student_id', studentId)
      .in('application_status', approvedStatuses),
    getCycles(),
    getPartnerUniversities(),
  ])
  const loadError = [applicationsResult, cyclesResult, universitiesResult].find(({ error }) => error)?.error
  if (loadError) return { error: getDatabaseErrorMessage(loadError), applications: [] }

  const applicationIds = (applicationsResult.data || []).map(({ application_id: id }) => id)
  let feedback = []
  if (applicationIds.length > 0) {
    const { data, error } = await supabase.from('feedback').select(feedbackColumns).in('oapplicationid', applicationIds)
    if (error) return { error: getDatabaseErrorMessage(error), applications: [] }
    feedback = data || []
  }

  const cycles = new Map(cyclesResult.data.map((cycle) => [cycle.id, cycle]))
  const universityNames = new Map(universitiesResult.data.map((university) => [university.university_id, university.name]))
  const applications = (applicationsResult.data || [])
    .map((application) => ({
      id: application.application_id,
      cycle: cycles.get(application.semester_applied_for),
      universityName: universityNames.get(application.university_id) || 'Your host university',
      feedback: feedback.find((item) => item.oapplicationid === application.application_id) || null,
    }))
    .sort((left, right) => String(right.cycle?.cycle_end ?? '').localeCompare(String(left.cycle?.cycle_end ?? '')))
  return { error: '', applications }
}

function FeedbackForm({ application, onSubmitted, onDuplicate }) {
  const [rating, setRating] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const ratingId = `host-feedback-rating-${application.id}`
  const commentId = `host-feedback-comment-${application.id}`

  async function submit(event) {
    event.preventDefault()
    const problem = ratingError(rating)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    setSaving(true)
    const { data, error: saveError } = await supabase
      .from('feedback')
      .insert({ oapplicationid: application.id, rating: Number(rating), details: comment.trim() || null })
      .select(feedbackColumns)
      .single()
    setSaving(false)
    if (saveError?.code === '23505') {
      onDuplicate()
      return
    }
    if (saveError) {
      setError(getDatabaseErrorMessage(saveError))
      return
    }
    onSubmitted(data)
  }

  return (
    <form className="auth-form host-feedback__form" onSubmit={submit} noValidate>
      <label htmlFor={ratingId}>Rating (1 to 5)</label>
      <input
        id={ratingId}
        type="number"
        inputMode="numeric"
        min="1"
        max="5"
        step="1"
        required
        aria-describedby={`${ratingId}-hint`}
        value={rating}
        onChange={(event) => {
          setRating(event.target.value)
          setError('')
        }}
        disabled={saving}
      />
      <p id={`${ratingId}-hint`} className="host-feedback__hint">1 is poor and 5 is excellent.</p>
      <label htmlFor={commentId}>Tips for future applicants (optional)</label>
      <textarea
        id={commentId}
        rows="4"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        disabled={saving}
      />
      {error && <p className="auth-form__error" role="alert">{error}</p>}
      <button className="btn btn--primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit feedback'}</button>
    </form>
  )
}

export default function HostUniversityFeedback({ studentId }) {
  const [state, setState] = useState({ loading: true, error: '', applications: [] })
  const [notices, setNotices] = useState({})

  useEffect(() => {
    let isCurrent = true
    readOwnFeedback(studentId).then((result) => {
      if (isCurrent) setState({ loading: false, ...result })
    })
    return () => {
      isCurrent = false
    }
  }, [studentId])

  const saveFeedback = (applicationId, feedback) => {
    setState((current) => ({
      ...current,
      applications: current.applications.map((application) => (
        application.id === applicationId ? { ...application, feedback } : application
      )),
    }))
  }

  // Another tab may have rated this application first, so the saved rating is read back and
  // shown beside the message.
  const showDuplicate = async (applicationId) => {
    setNotices((current) => ({ ...current, [applicationId]: { error: true, text: duplicateMessage } }))
    const { data } = await supabase.from('feedback').select(feedbackColumns).eq('oapplicationid', applicationId).maybeSingle()
    if (data) saveFeedback(applicationId, data)
  }

  const ended = state.applications.filter((application) => semesterHasEnded(application.cycle))
  const upcoming = state.applications.find((application) => !semesterHasEnded(application.cycle))

  return (
    <section className="host-feedback" aria-labelledby="host-feedback-heading">
      <h2 id="host-feedback-heading">Rate your host university</h2>
      <p>Tell future applicants what to expect. KU students and coordinators can read your rating under Ratings; your name is not shown.</p>
      {state.loading && <p role="status">Loading your applications…</p>}
      {state.error && <p className="auth-form__error" role="alert">{state.error}</p>}
      {!state.loading && !state.error && ended.length === 0 && (
        <p className="host-feedback__locked">
          {upcoming
            ? `You can rate ${upcoming.universityName} once your exchange semester ends${upcoming.cycle?.cycle_end ? ` on ${formatDate(upcoming.cycle.cycle_end)}` : ''}.`
            : 'You can rate your host university here once your outbound application is accepted and your exchange semester has ended.'}
        </p>
      )}
      {ended.map((application) => {
        const notice = notices[application.id]
        return (
          <article key={application.id} className="host-feedback__card" aria-labelledby={`host-feedback-${application.id}`}>
            <h3 id={`host-feedback-${application.id}`}>{application.universityName}</h3>
            <p className="host-feedback__semester">{cycleLabel(application.cycle)}</p>
            {notice && (
              <p className={notice.error ? 'auth-form__error' : 'host-feedback__confirmation'} role={notice.error ? 'alert' : 'status'}>
                {notice.text}
              </p>
            )}
            {application.feedback ? (
              <div className="host-feedback__submitted">
                <p>You rated this university on {formatDate(application.feedback.created_at)}.</p>
                <Stars rating={application.feedback.rating} />
                <p className="host-feedback__comment">{application.feedback.details || 'No comment.'}</p>
              </div>
            ) : (
              <FeedbackForm
                application={application}
                onDuplicate={() => showDuplicate(application.id)}
                onSubmitted={(feedback) => {
                  saveFeedback(application.id, feedback)
                  setNotices((current) => ({
                    ...current,
                    [application.id]: { error: false, text: `Thank you. Your feedback on ${application.universityName} was submitted.` },
                  }))
                }}
              />
            )}
          </article>
        )
      })}
    </section>
  )
}

export function HostUniversityRatings() {
  const [state, setState] = useState({ loading: true, error: '', groups: [] })

  useEffect(() => {
    let isCurrent = true
    supabase
      .from('feedback')
      .select('id, rating, details, created_at, university_id, partneruniversity(name)')
      .not('oapplicationid', 'is', null)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!isCurrent) return
        if (error) {
          setState({ loading: false, error: getDatabaseErrorMessage(error), groups: [] })
          return
        }
        const groups = new Map()
        for (const item of data || []) {
          const group = groups.get(item.university_id) || {
            id: item.university_id,
            // A retired university is hidden from students and partner coordinators.
            name: item.partneruniversity?.name || 'Former partner university',
            ratings: [],
          }
          group.ratings.push(item)
          groups.set(item.university_id, group)
        }
        setState({
          loading: false,
          error: '',
          groups: [...groups.values()].sort((left, right) => left.name.localeCompare(right.name)),
        })
      })
    return () => {
      isCurrent = false
    }
  }, [])

  return (
    <section className="host-feedback" aria-labelledby="ratings-heading">
      <h2 id="ratings-heading">Ratings</h2>
      <p>What KU students said about their host universities after their exchange semester.</p>
      {state.loading && <p role="status">Loading ratings…</p>}
      {state.error && <p className="auth-form__error" role="alert">{state.error}</p>}
      {!state.loading && !state.error && state.groups.length === 0 && (
        <p className="host-feedback__locked">No outgoing students have rated a host university yet.</p>
      )}
      {state.groups.map((group) => (
        <article key={group.id} className="host-feedback__card" aria-labelledby={`ratings-${group.id}`}>
          <h3 id={`ratings-${group.id}`}>{group.name}</h3>
          <p className="host-feedback__semester">{group.ratings.length === 1 ? '1 rating' : `${group.ratings.length} ratings`}</p>
          <ul className="host-feedback__list">
            {group.ratings.map((item) => (
              <li key={item.id}>
                <Stars rating={item.rating} />
                <p className="host-feedback__comment">{item.details || 'No comment.'}</p>
                <p className="host-feedback__date">{formatDate(item.created_at)}</p>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  )
}
