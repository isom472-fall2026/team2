import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import ErdPage from './ErdPage'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_ACCESS_TOKEN } from '../js/config.js'
import { supabase } from './supabase'
import './App.css'

const authOptions = {
  ku: {
    label: 'KU Student',
    table: 'kustudentauth',
    heading: 'KU Student Portal',
    description: 'Sign in or create an account with your Kuwait University details.',
  },
  incoming: {
    label: 'Incoming Student',
    table: 'incomingstudentauth',
    heading: 'Incoming Student Portal',
    description: 'Sign in or create an account to manage your exchange application.',
  },
  coordinator: {
    label: 'Coordinator',
    table: 'coordinator',
    heading: 'Coordinator Portal',
    description: 'Sign in or create an account for a partner university coordinator.',
  },
}

function generateIncomingStudentId() {
  const randomValues = new Uint32Array(1)
  crypto.getRandomValues(randomValues)
  return 100000000 + (randomValues[0] % 900000000)
}

function generateCoordinatorId() {
  return generateIncomingStudentId()
}

function generateNominationId() {
  const randomValues = new Uint32Array(1)
  crypto.getRandomValues(randomValues)
  return 10000000 + (randomValues[0] % 90000000)
}

function SuccessToast({ message, onClose }) {
  useEffect(() => {
    const timeoutId = window.setTimeout(onClose, 4000)
    return () => window.clearTimeout(timeoutId)
  }, [message, onClose])

  return (
    <div className="success-toast" role="status" aria-live="polite">
      <span className="success-toast__icon" aria-hidden="true">✓</span>
      <p className="success-toast__message">{message}</p>
      <button className="success-toast__close" type="button" onClick={onClose} aria-label="Close notification">
        ×
      </button>
      <span className="success-toast__progress" aria-hidden="true" />
    </div>
  )
}

function AuthPage({ type, mode, onTypeChange, onModeChange, onAuthenticated }) {
  const options = authOptions[type]
  const isSignUp = mode === 'signup'
  const [form, setForm] = useState({ email: '', password: '', name: '', studentId: '', university: '' })
  const [universities, setUniversities] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [toastId, setToastId] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [accessRequested, setAccessRequested] = useState(false)
  const dismissSuccess = useCallback(() => setMessage(''), [])

  useEffect(() => {
    if (type !== 'coordinator') return

    supabase
      .from('partneruniversity')
      .select('university_id, name')
      .eq('available', true)
      .order('name')
      .then(({ data, error: universityError }) => {
        if (universityError) setError(universityError.message)
        setUniversities(data || [])
      })
  }, [type])

  const updateField = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value })
    setError('')
    setMessage('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (isSignUp && (!form.name.trim() || (type === 'ku' && !/^\d+$/.test(form.studentId)) || (type === 'coordinator' && !form.university))) {
      setError(type === 'ku' ? 'Enter your name and a numeric student ID.' : type === 'coordinator' ? 'Enter your name and choose a university.' : 'Enter your name.')
      return
    }

    const email = form.email.trim().toLowerCase()
    const selectedUniversityId = Number(form.university)
    const isKuEmail = email.endsWith('@ku.edu.kw')
    const isKuUniversity = selectedUniversityId === 4
    if (isSignUp && type === 'ku' && !isKuEmail) {
      setError('KU students must use an email ending with @ku.edu.kw.')
      return
    }
    if (isSignUp && type === 'coordinator' && isKuEmail !== isKuUniversity) {
      setError('Kuwait University coordinators must select Kuwait University and use an email ending with @ku.edu.kw.')
      return
    }

    setIsSubmitting(true)
    const profileId = type === 'incoming'
      ? generateIncomingStudentId()
      : type === 'coordinator'
        ? generateCoordinatorId()
        : Number(form.studentId)
    const result = isSignUp
      ? await supabase.auth.signUp({
          email,
          password: form.password,
          options: {
            data: { name: form.name.trim(), student_id: profileId, user_type: type },
          },
        })
      : await supabase.auth.signInWithPassword({
          email,
          password: form.password,
        })

    if (result.error) {
      setError(result.error.message)
      setIsSubmitting(false)
      return
    }

    if (isSignUp) {
      if (!result.data.user) {
        setError('Supabase did not create the account. Please try again.')
        setIsSubmitting(false)
        return
      }

      const profile = type === 'coordinator'
        ? {
            coordinator_id: profileId,
            name: form.name.trim(),
            email,
            university: isKuEmail ? 4 : selectedUniversityId,
            email_accepted: type === 'coordinator' ? isKuEmail : undefined,
            user_id: result.data.user.id,
          }
        : {
            student_id: profileId,
            student_email: email,
            name: form.name.trim(),
            user_id: result.data.user.id,
          }
      const { error: profileError } = await supabase.from(options.table).insert(profile)

      if (profileError) {
        setError(profileError.code === '23505'
          ? 'An account with this ID or email already exists.'
          : profileError.message)
        setIsSubmitting(false)
        return
      }

      if (!result.data.session) {
        setMessage('Account created. Check your email to confirm your account, then sign in.')
        setToastId((currentId) => currentId + 1)
        setIsSubmitting(false)
        return
      }
      if (type === 'coordinator' && !isKuEmail) {
        const { error: signOutError } = await supabase.auth.signOut()
        if (signOutError) {
          setError(signOutError.message)
          setIsSubmitting(false)
          return
        }
        setAccessRequested(true)
        setIsSubmitting(false)
        return
      }
    }

    onAuthenticated(result.data.session)
    setIsSubmitting(false)
  }

  if (accessRequested) {
    return (
      <section className="auth-page" aria-labelledby="access-requested-heading">
        <div className="auth-card">
          <span className="auth-card__eyebrow">Access requested</span>
          <h1 id="access-requested-heading">Your request is under review</h1>
          <p className="auth-card__description">
            Your coordinator account was created. A Kuwait University coordinator will review your request, and you will be notified as soon as access is granted.
          </p>
          <button className="btn btn--primary btn--full" type="button" onClick={() => {
            setAccessRequested(false)
            onModeChange('signin')
          }}>
            Return to sign in
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="auth-page" aria-labelledby="auth-heading">
      <div className="auth-card">
        <span className="auth-card__eyebrow">{options.label}</span>
        <h1 id="auth-heading">{isSignUp ? `Create your ${options.label} account` : `Sign in to the ${options.label} portal`}</h1>
        <p className="auth-card__description">{options.description}</p>
        <fieldset className="auth-type-choice">
          <legend>User type</legend>
          {Object.entries(authOptions).map(([userType, userOptions]) => (
            <label key={userType} className="auth-type-choice__option">
              <input
                type="radio"
                name="userType"
                value={userType}
                checked={type === userType}
                onChange={() => onTypeChange(userType)}
              />
              {userOptions.label}
            </label>
          ))}
        </fieldset>
        {type === 'coordinator' && (
          <p className="auth-warning" role="alert">
            only for partner university coordinators, attempts at misuse by students will be caught and legally prosecuted
          </p>
        )}
        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignUp && (
            <>
              <label htmlFor="name">Full name</label>
              <input id="name" name="name" value={form.name} onChange={updateField} required autoComplete="name" />
              {type === 'ku' && (
                <>
                  <label htmlFor="studentId">Student ID</label>
                  <input id="studentId" name="studentId" value={form.studentId} onChange={updateField} required inputMode="numeric" />
                </>
              )}
              {type === 'coordinator' && (
                <>
                  <label htmlFor="university">University</label>
                  <select id="university" name="university" value={form.university} onChange={updateField} required>
                    <option value="">Choose your university</option>
                    {universities.map((university) => (
                      <option key={university.university_id} value={university.university_id}>{university.name}</option>
                    ))}
                  </select>
                </>
              )}
            </>
          )}
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" value={form.email} onChange={updateField} required autoComplete="email" />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" value={form.password} onChange={updateField} required minLength="6" autoComplete={isSignUp ? 'new-password' : 'current-password'} />
          {error && <p className="auth-form__error" role="alert">{error}</p>}
          <button className="btn btn--primary btn--full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Working...' : isSignUp && type === 'coordinator' && Number(form.university) !== 4 ? 'Request access' : isSignUp ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <button className="auth-card__switch" type="button" onClick={() => onModeChange(isSignUp ? 'signin' : 'signup')}>
          {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
        </button>
      </div>
      {message && (
        <SuccessToast
          key={toastId}
          message={message}
          onClose={dismissSuccess}
        />
      )}
    </section>
  )
}

function AccountDeleteButton({ onDeleted }) {
  const [error, setError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)

  const deleteAccount = async () => {
    setError('')
    setIsDeleting(true)
    const { error: deleteError } = await supabase.rpc('delete_my_account')
    if (deleteError) {
      setError(deleteError.message)
      setIsDeleting(false)
      return
    }

    await supabase.auth.signOut()
    onDeleted()
  }

  return (
    <div className="account-delete">
      {!isConfirming ? (
        <button className="btn btn--danger" type="button" onClick={() => setIsConfirming(true)} disabled={isDeleting}>
          Delete account
        </button>
      ) : (
        <div className="account-delete__confirmation" role="alertdialog" aria-labelledby="delete-account-heading">
          <strong id="delete-account-heading">Delete your account permanently?</strong>
          <p>This cannot be undone. Your profile and authentication account will be removed.</p>
          <div className="account-delete__actions">
            <button className="btn btn--secondary" type="button" onClick={() => setIsConfirming(false)} disabled={isDeleting}>
              Cancel
            </button>
            <button className="btn btn--danger" type="button" onClick={deleteAccount} disabled={isDeleting}>
              {isDeleting ? 'Deleting account...' : 'Permanently delete'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="auth-form__error" role="alert">{error}</p>}
    </div>
  )
}

const emptyCycleForm = {
  semester: 'Fall',
  academicYear: '',
  nominationsOpen: '',
  nominationsClose: '',
  applicationOpen: '',
  applicationClose: '',
  cycleStart: '',
  cycleEnd: '',
}

function formatCycleDate(value) {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleString()
}

function toDateTimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function validateCycleForm(form) {
  const dates = [
    ['nominations', form.nominationsOpen, form.nominationsClose],
    ['applications', form.applicationOpen, form.applicationClose],
    ['exchange cycle', form.cycleStart, form.cycleEnd],
  ]
  return dates.some(([, open, close]) => new Date(open) >= new Date(close))
    ? 'Each opening or start date must be before its closing or end date.'
    : ''
}

function cycleDataFromForm(form) {
  return {
    semester: form.semester,
    academic_year: form.academicYear,
    nominations_o: new Date(form.nominationsOpen).toISOString(),
    nominations_c: new Date(form.nominationsClose).toISOString(),
    application_o: new Date(form.applicationOpen).toISOString(),
    application_c: new Date(form.applicationClose).toISOString(),
    cycle_start: new Date(form.cycleStart).toISOString(),
    cycle_end: new Date(form.cycleEnd).toISOString(),
  }
}

function cycleFormFromCycle(cycle) {
  return {
    semester: cycle.semester,
    academicYear: cycle.academic_year,
    nominationsOpen: toDateTimeLocal(cycle.nominations_o),
    nominationsClose: toDateTimeLocal(cycle.nominations_c),
    applicationOpen: toDateTimeLocal(cycle.application_o),
    applicationClose: toDateTimeLocal(cycle.application_c),
    cycleStart: toDateTimeLocal(cycle.cycle_start),
    cycleEnd: toDateTimeLocal(cycle.cycle_end),
  }
}

function CycleForm({ form, setForm, onSubmit, isSubmitting, status, submitLabel, onCancel }) {
  const updateField = (event) => setForm({ ...form, [event.target.name]: event.target.value })

  return (
    <form className="cycle-form" onSubmit={onSubmit}>
      <div className="cycle-form__grid">
        <label htmlFor="cycle-semester">Semester
          <select id="cycle-semester" name="semester" value={form.semester} onChange={updateField} required>
            <option value="Fall">Fall</option>
            <option value="Spring">Spring</option>
          </select>
        </label>
        <label htmlFor="cycle-academic-year">Academic year
          <input id="cycle-academic-year" name="academicYear" value={form.academicYear} onChange={updateField} placeholder="2026/2027" pattern="\d{4}/\d{4}" required />
        </label>
        <label htmlFor="cycle-nominations-open">Inbound nominations open
          <input id="cycle-nominations-open" name="nominationsOpen" type="datetime-local" value={form.nominationsOpen} onChange={updateField} required />
        </label>
        <label htmlFor="cycle-nominations-close">Inbound nominations close
          <input id="cycle-nominations-close" name="nominationsClose" type="datetime-local" value={form.nominationsClose} onChange={updateField} required />
        </label>
        <label htmlFor="cycle-application-open">Applications open
          <input id="cycle-application-open" name="applicationOpen" type="datetime-local" value={form.applicationOpen} onChange={updateField} required />
        </label>
        <label htmlFor="cycle-application-close">Applications close
          <input id="cycle-application-close" name="applicationClose" type="datetime-local" value={form.applicationClose} onChange={updateField} required />
        </label>
        <label htmlFor="cycle-start">Exchange cycle starts
          <input id="cycle-start" name="cycleStart" type="datetime-local" value={form.cycleStart} onChange={updateField} required />
        </label>
        <label htmlFor="cycle-end">Exchange cycle ends
          <input id="cycle-end" name="cycleEnd" type="datetime-local" value={form.cycleEnd} onChange={updateField} required />
        </label>
      </div>
      {status.error && <p className="auth-form__error" role="alert">{status.error}</p>}
      <div className="cycle-form__actions">
        <button className="btn btn--primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving cycle...' : submitLabel}
        </button>
        {onCancel && <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={isSubmitting}>Cancel</button>}
      </div>
    </form>
  )
}

function CoordinatorPortal({ profile, userEmail, onDeleted }) {
  const profileEmailIsKu = profile.email?.trim().toLowerCase().endsWith('@ku.edu.kw')
  const authenticatedEmailIsKu = userEmail?.trim().toLowerCase().endsWith('@ku.edu.kw')
  const universityId = profile.university ?? profile.university_id
  const isKuCoordinator = Number(universityId) === 4
    || profileEmailIsKu
    || authenticatedEmailIsKu
  const [nominations, setNominations] = useState([])
  const [isLoadingNominations, setIsLoadingNominations] = useState(true)
  const [editingNominationId, setEditingNominationId] = useState(null)
  const [nominationEditForm, setNominationEditForm] = useState({
    studentName: '',
    studentEmail: '',
    studentNationality: '',
    semester: '',
  })
  const [nominationEditError, setNominationEditError] = useState('')
  const [isSavingNomination, setIsSavingNomination] = useState(false)
  const [pendingDeleteNomination, setPendingDeleteNomination] = useState(null)
  const [isDeletingNomination, setIsDeletingNomination] = useState(false)
  const [semesters, setSemesters] = useState([])
  const [form, setForm] = useState({ studentName: '', studentEmail: '', studentNationality: '', semester: '' })
  const [cycleForm, setCycleForm] = useState(emptyCycleForm)
  const [cycles, setCycles] = useState([])
  const [coordinators, setCoordinators] = useState([])
  const [partnerUniversities, setPartnerUniversities] = useState([])
  const [isLoadingCoordinators, setIsLoadingCoordinators] = useState(isKuCoordinator)
  const [editingCycleId, setEditingCycleId] = useState(null)
  const [pendingDeleteCycle, setPendingDeleteCycle] = useState(null)
  const [isDeletingCycle, setIsDeletingCycle] = useState(false)
  const [activeView, setActiveView] = useState(isKuCoordinator ? 'manage' : 'nominations')
  const [selectedNominationCycle, setSelectedNominationCycle] = useState(null)
  const [isStartingCycle, setIsStartingCycle] = useState(false)
  const [status, setStatus] = useState({ error: '', message: '' })
  const [toastId, setToastId] = useState(0)
  const dismissSuccess = useCallback(
    () => setStatus((currentStatus) => ({ ...currentStatus, message: '' })),
    [],
  )

  const loadCycles = async () => {
    const { data, error } = await supabase
      .from('exchange_cycle')
      .select('id, semester, academic_year, nominations_o, nominations_c, application_o, application_c, cycle_start, cycle_end')
      .order('cycle_start', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
    if (error) {
      setStatus({ error: error.message, message: '' })
      return false
    }
    setCycles(data || [])
    return true
  }

  useEffect(() => {
    let isCurrent = true
    const loadNominations = async () => {
      let nominationsQuery = supabase
        .from('studentnominations')
        .select('id, student_name, student_email, student_nationality, created_at, semester, nomination_status')
      if (!isKuCoordinator) nominationsQuery = nominationsQuery.eq('coordinator_id', profile.coordinator_id)
      const { data, error } = await nominationsQuery.order('created_at', { ascending: false })
      if (!isCurrent) return
      if (error) setStatus({ error: error.message, message: '' })
      else setNominations(data || [])
      setIsLoadingNominations(false)
    }
    loadNominations()

    supabase
      .from('exchange_cycle')
      .select('id, semester, academic_year, nominations_o, nominations_c, application_o, application_c, cycle_start, cycle_end')
      .order('cycle_start', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .then(({ data, error }) => {
        if (error) setStatus({ error: error.message, message: '' })
        else setCycles(data || [])
      })
    supabase.from('exchange_cycle').select('id, semester, academic_year').order('id').then(({ data, error }) => {
      if (error) setStatus({ error: error.message, message: '' })
      else setSemesters(data || [])
    })
    if (isKuCoordinator) {
      supabase
        .from('coordinator')
        .select('coordinator_id, name, email, university, email_accepted')
        .neq('coordinator_id', profile.coordinator_id)
        .order('name')
        .then(({ data, error }) => {
          if (error) setStatus({ error: error.message, message: '' })
          else setCoordinators(data || [])
          setIsLoadingCoordinators(false)
        })
      supabase
        .from('partneruniversity')
        .select('university_id, name')
        .order('name')
        .then(({ data, error }) => {
          if (error) setStatus({ error: error.message, message: '' })
          else setPartnerUniversities(data || [])
        })
    }
    return () => {
      isCurrent = false
    }
  }, [profile.coordinator_id, isKuCoordinator])

  const updateCoordinatorAccess = async (coordinator, isAccepted) => {
    setStatus({ error: '', message: '' })
    if (isAccepted) {
      const { data, error } = await supabase
        .from('coordinator')
        .update({ email_accepted: true })
        .eq('coordinator_id', coordinator.coordinator_id)
        .select('coordinator_id, name, email, university, email_accepted')
        .maybeSingle()
      if (error) {
        setStatus({ error: error.message, message: '' })
        return
      }
      if (!data) {
        setStatus({ error: 'The coordinator access was not updated. You may not have permission.', message: '' })
        return
      }
      setCoordinators((current) => current.map((item) => item.coordinator_id === data.coordinator_id ? data : item))
      setStatus({ error: '', message: 'Coordinator access granted.' })
    } else {
      const { data, error } = await supabase
        .from('coordinator')
        .delete()
        .eq('coordinator_id', coordinator.coordinator_id)
        .select('coordinator_id')
        .maybeSingle()
      if (error) {
        setStatus({ error: error.message, message: '' })
        return
      }
      if (!data) {
        setStatus({ error: 'The coordinator request was not removed. You may not have permission.', message: '' })
        return
      }
      setCoordinators((current) => current.filter((item) => item.coordinator_id !== data.coordinator_id))
      setStatus({ error: '', message: 'Coordinator request refused.' })
    }
    setToastId((currentId) => currentId + 1)
  }

  const startExchangeCycle = async (event) => {
    event.preventDefault()
    setStatus({ error: '', message: '' })
    const validationError = validateCycleForm(cycleForm)
    if (validationError) {
      setStatus({ error: validationError, message: '' })
      return
    }
    setIsStartingCycle(true)
    const { data: existingCycle, error: duplicateCheckError } = await supabase
      .from('exchange_cycle')
      .select('id')
      .eq('semester', cycleForm.semester)
      .eq('academic_year', cycleForm.academicYear)
      .limit(1)
      .maybeSingle()
    if (duplicateCheckError) {
      setStatus({ error: duplicateCheckError.message, message: '' })
      setIsStartingCycle(false)
      return
    }
    if (existingCycle) {
      setStatus({
        error: `A ${cycleForm.semester} ${cycleForm.academicYear} exchange cycle already exists.`,
        message: '',
      })
      setIsStartingCycle(false)
      return
    }

    const { data: latestCycle, error: latestCycleError } = await supabase
      .from('exchange_cycle')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestCycleError) {
      setStatus({ error: latestCycleError.message, message: '' })
      setIsStartingCycle(false)
      return
    }

    const { error } = await supabase.from('exchange_cycle').insert({
      id: (latestCycle?.id ?? 0) + 1,
      ...cycleDataFromForm(cycleForm),
    })
    if (error) {
      setStatus({ error: error.message, message: '' })
    } else {
      setCycleForm(emptyCycleForm)
      if (await loadCycles()) {
        setStatus({ error: '', message: 'Exchange cycle started.' })
        setToastId((currentId) => currentId + 1)
        setActiveView('manage')
      }
    }
    setIsStartingCycle(false)
  }

  const editExchangeCycle = async (event) => {
    event.preventDefault()
    setStatus({ error: '', message: '' })
    const validationError = validateCycleForm(cycleForm)
    if (validationError) {
      setStatus({ error: validationError, message: '' })
      return
    }

    const { data: existingCycle, error: duplicateCheckError } = await supabase
      .from('exchange_cycle')
      .select('id')
      .eq('semester', cycleForm.semester)
      .eq('academic_year', cycleForm.academicYear)
      .neq('id', editingCycleId)
      .limit(1)
      .maybeSingle()
    if (duplicateCheckError) {
      setStatus({ error: duplicateCheckError.message, message: '' })
      return
    }
    if (existingCycle) {
      setStatus({
        error: `A ${cycleForm.semester} ${cycleForm.academicYear} exchange cycle already exists.`,
        message: '',
      })
      return
    }

    setIsStartingCycle(true)
    const { data: updatedCycle, error } = await supabase
      .from('exchange_cycle')
      .update(cycleDataFromForm(cycleForm))
      .eq('id', editingCycleId)
      .select('id')
      .maybeSingle()
    setIsStartingCycle(false)
    if (error) {
      setStatus({ error: error.message, message: '' })
      return
    }
    if (!updatedCycle) {
      setStatus({ error: 'The cycle was not updated. It may have been removed or you may not have permission.', message: '' })
      return
    }
    if (await loadCycles()) {
      setEditingCycleId(null)
      setStatus({ error: '', message: 'Exchange cycle updated.' })
      setToastId((currentId) => currentId + 1)
    }
  }

  const deleteExchangeCycle = async () => {
    if (!pendingDeleteCycle) return
    const cycle = pendingDeleteCycle
    setStatus({ error: '', message: '' })
    setIsDeletingCycle(true)
    const { data: deletedCycle, error } = await supabase
      .from('exchange_cycle')
      .delete()
      .eq('id', cycle.id)
      .select('id')
      .maybeSingle()
    setIsDeletingCycle(false)
    if (error) {
      setStatus({ error: error.message, message: '' })
      return
    }
    if (!deletedCycle) {
      setStatus({ error: 'The cycle was not deleted. It may have already been removed or you may not have permission.', message: '' })
      return
    }
    setCycles((currentCycles) => currentCycles.filter(({ id }) => id !== cycle.id))
    if (editingCycleId === cycle.id) setEditingCycleId(null)
    setPendingDeleteCycle(null)
    setStatus({ error: '', message: 'Exchange cycle deleted.' })
    setToastId((currentId) => currentId + 1)
  }

  const submitNomination = async (event) => {
    event.preventDefault()
    setStatus({ error: '', message: '' })
    const coordinatorId = Number(profile.coordinator_id)
    if (!Number.isInteger(coordinatorId) || coordinatorId <= 0) {
      setStatus({ error: 'Your coordinator profile could not be identified. Please sign in again.', message: '' })
      return
    }
    let nominationId
    let error
    for (let attempt = 0; attempt < 5; attempt += 1) {
      nominationId = generateNominationId()
      const result = await supabase.from('studentnominations').insert({
        id: nominationId,
        coordinator_id: coordinatorId,
        student_name: form.studentName.trim(),
        student_email: form.studentEmail.trim(),
        student_nationality: form.studentNationality.trim(),
        semester: Number(form.semester),
      })
      error = result.error
      if (!error || error.code !== '23505') break
    }
    if (error) {
      setStatus({ error: error.code === '23505' ? 'A unique nomination ID could not be generated. Please try again.' : error.message, message: '' })
      return
    }
    setForm({ studentName: '', studentEmail: '', studentNationality: '', semester: '' })
    setStatus({ error: '', message: `Student nomination submitted. Save nomination ID ${nominationId} and share it with the student.` })
    setToastId((currentId) => currentId + 1)
    let nominationsQuery = supabase
      .from('studentnominations')
      .select('id, student_name, student_email, student_nationality, created_at, semester, nomination_status')
    if (!isKuCoordinator) nominationsQuery = nominationsQuery.eq('coordinator_id', coordinatorId)
    const { data: updatedNominations, error: refreshError } = await nominationsQuery
      .order('created_at', { ascending: false })
    if (refreshError) {
      setStatus({ error: refreshError.message, message: '' })
      return
    }
    setNominations(updatedNominations || [])
  }

  const saveNomination = async (event) => {
    event.preventDefault()
    setNominationEditError('')
    const coordinatorId = Number(profile.coordinator_id)
    if (!Number.isInteger(coordinatorId) || coordinatorId <= 0) {
      setNominationEditError('Your coordinator profile could not be identified. Please sign in again.')
      return
    }

    setIsSavingNomination(true)
    const { data: updatedNomination, error } = await supabase
      .from('studentnominations')
      .update({
        student_name: nominationEditForm.studentName.trim(),
        student_email: nominationEditForm.studentEmail.trim(),
        student_nationality: nominationEditForm.studentNationality.trim(),
        semester: Number(nominationEditForm.semester),
      })
      .eq('id', editingNominationId)
      .eq('coordinator_id', coordinatorId)
      .select('id, student_name, student_email, student_nationality, created_at, semester, nomination_status')
      .maybeSingle()
    setIsSavingNomination(false)
    if (error) {
      setNominationEditError(error.message)
      return
    }
    if (!updatedNomination) {
      setNominationEditError('The nomination was not updated. It may have been removed or you may not have permission.')
      return
    }

    setNominations((currentNominations) => currentNominations.map(
      (nomination) => nomination.id === updatedNomination.id ? updatedNomination : nomination,
    ))
    setEditingNominationId(null)
    setStatus({ error: '', message: 'Nomination updated.' })
    setToastId((currentId) => currentId + 1)
  }

  const deleteNomination = async () => {
    if (!pendingDeleteNomination) return
    const coordinatorId = Number(profile.coordinator_id)
    if (!Number.isInteger(coordinatorId) || coordinatorId <= 0) {
      setStatus({ error: 'Your coordinator profile could not be identified. Please sign in again.', message: '' })
      return
    }

    setStatus({ error: '', message: '' })
    setIsDeletingNomination(true)
    const { data: deletedNomination, error } = await supabase
      .from('studentnominations')
      .delete()
      .eq('id', pendingDeleteNomination.id)
      .eq('coordinator_id', coordinatorId)
      .select('id')
      .maybeSingle()
    setIsDeletingNomination(false)
    if (error) {
      setStatus({ error: error.message, message: '' })
      return
    }
    if (!deletedNomination) {
      setStatus({ error: 'The nomination was not deleted. It may have already been removed or you may not have permission.', message: '' })
      return
    }

    setNominations((currentNominations) => currentNominations.filter(
      ({ id }) => id !== deletedNomination.id,
    ))
    if (editingNominationId === deletedNomination.id) setEditingNominationId(null)
    setPendingDeleteNomination(null)
    setStatus({ error: '', message: 'Nomination deleted.' })
    setToastId((currentId) => currentId + 1)
  }

  const visibleNominations = activeView === 'cycle-nominations' && selectedNominationCycle
    ? nominations.filter(({ semester }) => Number(semester) === Number(selectedNominationCycle.id))
    : nominations

  return (
    <div className="portal-dashboard portal-dashboard--coordinator">
      {status.message && (
        <SuccessToast
          key={toastId}
          message={status.message}
          onClose={dismissSuccess}
        />
      )}
      {pendingDeleteCycle && (
        <div className="cycle-delete-dialog__backdrop">
          <section
            className="cycle-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cycle-delete-heading"
            aria-describedby="cycle-delete-description"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !isDeletingCycle) {
                setPendingDeleteCycle(null)
                setStatus({ error: '', message: '' })
              }
            }}
          >
            <span className="cycle-delete-dialog__icon" aria-hidden="true">!</span>
            <h2 id="cycle-delete-heading">Delete exchange cycle?</h2>
            <p id="cycle-delete-description">
              You’re about to permanently delete <strong>{pendingDeleteCycle.semester} {pendingDeleteCycle.academic_year}</strong>.
              Any student nominations linked to this cycle will also be deleted. This action cannot be undone.
            </p>
            {status.error && <p className="auth-form__error" role="alert">{status.error}</p>}
            <div className="cycle-delete-dialog__actions">
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() => {
                  setPendingDeleteCycle(null)
                  setStatus({ error: '', message: '' })
                }}
                disabled={isDeletingCycle}
                autoFocus
              >
                Cancel
              </button>
              <button className="btn btn--danger" type="button" onClick={deleteExchangeCycle} disabled={isDeletingCycle}>
                {isDeletingCycle ? 'Deleting cycle...' : 'Delete cycle'}
              </button>
            </div>
          </section>
        </div>
      )}
      {pendingDeleteNomination && (
        <div className="cycle-delete-dialog__backdrop">
          <section
            className="cycle-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="nomination-delete-heading"
            aria-describedby="nomination-delete-description"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !isDeletingNomination) {
                setPendingDeleteNomination(null)
                setStatus({ error: '', message: '' })
              }
            }}
          >
            <span className="cycle-delete-dialog__icon" aria-hidden="true">!</span>
            <h2 id="nomination-delete-heading">Delete student nomination?</h2>
            <p id="nomination-delete-description">
              Permanently delete the nomination for <strong>{pendingDeleteNomination.student_name}</strong>? This action cannot be undone.
            </p>
            {status.error && <p className="auth-form__error" role="alert">{status.error}</p>}
            <div className="cycle-delete-dialog__actions">
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() => {
                  setPendingDeleteNomination(null)
                  setStatus({ error: '', message: '' })
                }}
                disabled={isDeletingNomination}
                autoFocus
              >
                Cancel
              </button>
              <button className="btn btn--danger" type="button" onClick={deleteNomination} disabled={isDeletingNomination}>
                {isDeletingNomination ? 'Deleting nomination...' : 'Delete nomination'}
              </button>
            </div>
          </section>
        </div>
      )}
      <aside className="portal-sidebar" aria-label="Coordinator portal navigation">
        <span className="portal-sidebar__eyebrow">Coordinator portal</span>
        <h1 className="portal-sidebar__title">KU Exchange</h1>
        <p className="portal-sidebar__welcome">Welcome, {profile.name}</p>
        <nav className="portal-sidebar__nav">
          {isKuCoordinator && (
            <button className={activeView === 'start' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('start')}>
              <span aria-hidden="true">＋</span> Start exchange cycle
            </button>
          )}
          <button className={activeView === 'manage' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('manage')}>
            <span aria-hidden="true">▦</span> Manage exchange cycle
          </button>
          <button className={activeView === 'nominations' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('nominations')}>
            <span aria-hidden="true">◌</span> Student nominations
          </button>
          {isKuCoordinator && (
            <button className={activeView === 'coordinators' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('coordinators')}>
              <span aria-hidden="true">♙</span> Coordinator access
            </button>
          )}
        </nav>
        <div className="portal-sidebar__footer">
          <span className="portal-sidebar__secure">Signed in securely</span>
        </div>
      </aside>
      <section className="portal-card portal-card--wide portal-card--workspace">
        {isKuCoordinator && activeView === 'start' && (
          <>
            <span className="auth-card__eyebrow">New cycle</span>
            <h2 id="portal-heading">Start an exchange cycle</h2>
            <p>Set the timetable for inbound nominations and exchange applications.</p>
            <CycleForm form={cycleForm} setForm={setCycleForm} onSubmit={startExchangeCycle} isSubmitting={isStartingCycle} status={status} submitLabel="Start exchange cycle" />
          </>
        )}
        {activeView === 'manage' && (
          <>
            <span className="auth-card__eyebrow">Cycle dashboard</span>
            <h2 id="portal-heading">Manage exchange cycles</h2>
            <p>Review the schedules currently available to students and coordinators.</p>
            {status.error && <p className="auth-form__error" role="alert">{status.error}</p>}
            {cycles.length === 0 ? <div className="portal-empty-state">No exchange cycles have been started yet.</div> : (
              <ul className="cycle-list">
                {cycles.map((cycle) => (
                  <li key={cycle.id} className="cycle-list__item">
                    {editingCycleId === cycle.id ? (
                      <CycleForm
                        form={cycleForm}
                        setForm={setCycleForm}
                        onSubmit={editExchangeCycle}
                        isSubmitting={isStartingCycle}
                        status={status}
                        submitLabel="Save changes"
                        onCancel={() => {
                          setEditingCycleId(null)
                          setStatus({ error: '', message: '' })
                        }}
                      />
                    ) : (
                      <>
                        <div className="cycle-list__heading"><strong>{cycle.semester} {cycle.academic_year}</strong><span>Cycle #{cycle.id}</span></div>
                        <dl>
                          <div><dt>Nominations</dt><dd>{formatCycleDate(cycle.nominations_o)} – {formatCycleDate(cycle.nominations_c)}</dd></div>
                          <div><dt>Applications</dt><dd>{formatCycleDate(cycle.application_o)} – {formatCycleDate(cycle.application_c)}</dd></div>
                          <div><dt>Exchange cycle</dt><dd>{formatCycleDate(cycle.cycle_start)} – {formatCycleDate(cycle.cycle_end)}</dd></div>
                        </dl>
                        <div className="cycle-list__actions">
                          {isKuCoordinator ? (
                            <>
                              <button
                                className="btn btn--secondary"
                                type="button"
                                onClick={() => {
                                  setCycleForm(cycleFormFromCycle(cycle))
                                  setEditingCycleId(cycle.id)
                                  setStatus({ error: '', message: '' })
                                }}
                              >
                                Edit cycle
                              </button>
                              <button className="btn btn--danger" type="button" onClick={() => {
                                setPendingDeleteCycle(cycle)
                                setStatus({ error: '', message: '' })
                              }}>
                                Delete cycle
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn btn--secondary"
                              type="button"
                              onClick={() => {
                                setSelectedNominationCycle(cycle)
                                setActiveView('cycle-nominations')
                              }}
                            >
                              View previous nominations
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {(activeView === 'nominations' || activeView === 'cycle-nominations') && (
          <>
            <span className="auth-card__eyebrow">Student nominations</span>
            {activeView === 'cycle-nominations' && selectedNominationCycle ? (
              <>
                <h2 id="portal-heading">
                  Previous nominations for {selectedNominationCycle.semester} {selectedNominationCycle.academic_year}
                </h2>
                <p>These are the nominations submitted for this exchange cycle.</p>
                <button className="btn btn--secondary" type="button" onClick={() => setActiveView('manage')}>
                  Back to exchange cycles
                </button>
              </>
            ) : !isKuCoordinator && (
              <>
                <h2 id="portal-heading">Submit a student nomination</h2>
                <p>Submit and review student nominations for your university.</p>
                <form className="nomination-form" onSubmit={submitNomination}>
                  <label htmlFor="studentName">Student name</label>
                  <input id="studentName" value={form.studentName} onChange={(event) => setForm({ ...form, studentName: event.target.value })} required />
                  <label htmlFor="studentEmail">Student email</label>
                  <input id="studentEmail" type="email" value={form.studentEmail} onChange={(event) => setForm({ ...form, studentEmail: event.target.value })} required />
                  <label htmlFor="studentNationality">Student nationality</label>
                  <input id="studentNationality" value={form.studentNationality} onChange={(event) => setForm({ ...form, studentNationality: event.target.value })} required />
                  <label htmlFor="semester">Exchange semester</label>
                  <select id="semester" value={form.semester} onChange={(event) => setForm({ ...form, semester: event.target.value })} required>
                    <option value="">Choose a semester</option>
                    {semesters.map((semester) => (
                      <option key={semester.id} value={semester.id}>
                        {semester.semester} {semester.academic_year}
                      </option>
                    ))}
                  </select>
                  {status.error && <p className="auth-form__error" role="alert">{status.error}</p>}
                  <button className="btn btn--primary" type="submit">Submit nomination</button>
                </form>
              </>
            )}
            <h2 className="portal-section-heading">Submitted nominations</h2>
        {editingNominationId !== null && (
          <form className="nomination-form nomination-edit-form" onSubmit={saveNomination}>
            <h3>Edit nomination</h3>
            <label htmlFor="edit-student-name">Student name</label>
            <input
              id="edit-student-name"
              value={nominationEditForm.studentName}
              onChange={(event) => setNominationEditForm({ ...nominationEditForm, studentName: event.target.value })}
              required
            />
            <label htmlFor="edit-student-email">Student email</label>
            <input
              id="edit-student-email"
              type="email"
              value={nominationEditForm.studentEmail}
              onChange={(event) => setNominationEditForm({ ...nominationEditForm, studentEmail: event.target.value })}
              required
            />
            <label htmlFor="edit-student-nationality">Student nationality</label>
            <input
              id="edit-student-nationality"
              value={nominationEditForm.studentNationality}
              onChange={(event) => setNominationEditForm({ ...nominationEditForm, studentNationality: event.target.value })}
              required
            />
            <label htmlFor="edit-nomination-semester">Exchange semester</label>
            <select
              id="edit-nomination-semester"
              value={nominationEditForm.semester}
              onChange={(event) => setNominationEditForm({ ...nominationEditForm, semester: event.target.value })}
              required
            >
              <option value="">Choose a semester</option>
              {semesters.map((semester) => (
                <option key={semester.id} value={semester.id}>
                  {semester.semester} {semester.academic_year}
                </option>
              ))}
            </select>
            {nominationEditError && <p className="auth-form__error" role="alert">{nominationEditError}</p>}
            <div className="cycle-form__actions">
              <button className="btn btn--primary" type="submit" disabled={isSavingNomination}>
                {isSavingNomination ? 'Saving changes...' : 'Save changes'}
              </button>
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() => {
                  setEditingNominationId(null)
                  setNominationEditError('')
                }}
                disabled={isSavingNomination}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {isLoadingNominations ? <p role="status">Loading submitted nominations...</p>
          : visibleNominations.length === 0 ? <p>{activeView === 'cycle-nominations' ? 'No nominations submitted for this exchange cycle.' : 'No nominations submitted yet.'}</p> : (
            <div className="nomination-table-wrap">
              <table className="nomination-table">
                <thead>
                  <tr>
                    <th scope="col">Nomination ID</th>
                    <th scope="col">Student</th>
                    <th scope="col">Email</th>
                    <th scope="col">Nationality</th>
                    <th scope="col">Exchange semester</th>
                    <th scope="col">Status</th>
                    <th scope="col">Submitted</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleNominations.map((nomination) => {
                    const semester = semesters.find(({ id }) => Number(id) === Number(nomination.semester))
                    return (
                      <tr key={nomination.id}>
                        <td>{nomination.id}</td>
                        <th scope="row">{nomination.student_name}</th>
                        <td>{nomination.student_email}</td>
                        <td>{nomination.student_nationality}</td>
                        <td>{semester ? `${semester.semester} ${semester.academic_year}` : `Cycle #${nomination.semester}`}</td>
                        <td>{nomination.nomination_status}</td>
                        <td>{formatCycleDate(nomination.created_at)}</td>
                        <td>
                          <div className="nomination-table__actions">
                            <button
                              className="btn btn--secondary"
                              type="button"
                              onClick={() => {
                                setEditingNominationId(nomination.id)
                                setNominationEditForm({
                                  studentName: nomination.student_name,
                                  studentEmail: nomination.student_email,
                                  studentNationality: nomination.student_nationality,
                                  semester: String(nomination.semester),
                                })
                                setNominationEditError('')
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn--danger"
                              type="button"
                              onClick={() => {
                                setPendingDeleteNomination(nomination)
                                setStatus({ error: '', message: '' })
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          </>
        )}
        {isKuCoordinator && activeView === 'coordinators' && (
          <>
            <span className="auth-card__eyebrow">Access control</span>
            <h2 id="portal-heading">Coordinator access</h2>
            <p>Review partner coordinator accounts and access requests.</p>
            {status.error && <p className="auth-form__error" role="alert">{status.error}</p>}
            {isLoadingCoordinators ? <p role="status">Loading coordinator accounts...</p>
              : coordinators.length === 0 ? <p>No other coordinator accounts found.</p> : (
                <div className="nomination-table-wrap">
                  <table className="nomination-table">
                    <thead>
                      <tr>
                        <th scope="col">Coordinator</th>
                        <th scope="col">Email</th>
                        <th scope="col">University</th>
                        <th scope="col">Access</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coordinators.map((coordinator) => (
                        <tr key={coordinator.coordinator_id}>
                          <th scope="row">{coordinator.name}</th>
                          <td>{coordinator.email}</td>
                          <td>{partnerUniversities.find(({ university_id }) => Number(university_id) === Number(coordinator.university))?.name || `University #${coordinator.university}`}</td>
                          <td>{coordinator.email_accepted ? 'Granted' : 'Requested'}</td>
                          <td>
                            <div className="nomination-table__actions">
                              {!coordinator.email_accepted && (
                                <button className="btn btn--secondary" type="button" onClick={() => updateCoordinatorAccess(coordinator, true)}>
                                  Accept
                                </button>
                              )}
                              <button className="btn btn--danger" type="button" onClick={() => updateCoordinatorAccess(coordinator, false)}>
                                Refuse
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </>
        )}
        <AccountDeleteButton onDeleted={onDeleted} />
      </section>
    </div>
  )
}

function CoordinatorAccessPending({ user, onSignOut, onDeleted }) {
  return (
    <section className="portal-page" aria-labelledby="access-pending-heading">
      <div className="portal-card">
        <span className="auth-card__eyebrow">Access pending</span>
        <h1 id="access-pending-heading">Your coordinator access is being reviewed</h1>
        <p>
          Your request for <strong>{user.email}</strong> has been sent to a Kuwait University coordinator.
          You will be notified as soon as your access is granted.
        </p>
        <button className="btn btn--secondary" type="button" onClick={onSignOut}>Log out</button>
        <AccountDeleteButton onDeleted={onDeleted} />
      </div>
    </section>
  )
}

function isKuCoordinatorProfile(profile, userEmail) {
  const profileEmailIsKu = profile.email?.trim().toLowerCase().endsWith('@ku.edu.kw')
  const authenticatedEmailIsKu = userEmail?.trim().toLowerCase().endsWith('@ku.edu.kw')
  const universityId = profile.university ?? profile.university_id
  return Number(universityId) === 4 || profileEmailIsKu || authenticatedEmailIsKu
}

function ProtectedPortal({ user, profile, onSignOut, onDeleted }) {
  if (profile?.role === 'coordinator') {
    const isKuCoordinator = isKuCoordinatorProfile(profile, user.email)
    if (!isKuCoordinator && profile.email_accepted !== true) {
      return <CoordinatorAccessPending user={user} onSignOut={onSignOut} onDeleted={onDeleted} />
    }
    return <CoordinatorPortal profile={profile} userEmail={user.email} onDeleted={onDeleted} />
  }

  return (
    <section className="portal-page" aria-labelledby="portal-heading">
      <div className="portal-card">
        <span className="auth-card__eyebrow">Secure portal</span>
        <h1 id="portal-heading">Welcome, {profile?.name || user.user_metadata?.name || user.email}</h1>
        <p>You are signed in as <strong>{user.email}</strong>.</p>
        <div className="portal-actions">
          {profile?.role === 'incoming' && <Link className="btn btn--primary" to="/portal/inbound-application">Inbound application</Link>}
          {profile?.role === 'ku' && <Link className="btn btn--secondary" to="/portal/outbound-application">Outbound application</Link>}
        </div>
        <button className="btn btn--secondary" type="button" onClick={onSignOut}>Log out</button>
        <AccountDeleteButton onDeleted={onDeleted} />
      </div>
    </section>
  )
}

const partnerUniversityWebsites = {
  'Audencia Nantes School of Management': 'https://www.audencia.com',
  'Bocconi University': 'https://www.unibocconi.it',
  'EM Normandie Business School': 'https://www.em-normandie.com',
  'Esade Business School': 'https://www.esade.edu',
  'ESC Rennes School of Business': 'https://www.rennes-sb.com',
  'Essec School of Business': 'https://www.essec.edu',
  'Goethe University': 'https://www.uni-frankfurt.de',
  'Hanyang University': 'https://www.hanyang.ac.kr',
  'HEC School of Management': 'https://www.hec.edu',
  'IE Business School': 'https://www.ie.edu',
  'Indian Institute of Management Bangalore': 'https://www.iimb.ac.in',
  'KEDGE Business School': 'https://kedge.edu',
  'Kogod School of Business': 'https://kogod.american.edu',
  'National Chengchi University': 'https://www.nccu.edu.tw',
  'National Taiwan University': 'https://www.ntu.edu.tw',
  'Neoma Business School': 'https://neoma-bs.com',
  'Paris School of Business': 'https://www.psbedu.paris',
  'Rotterdam School of Management': 'https://www.rsm.nl',
  'Skema Business School': 'https://www.skema.edu',
  'Toulouse Business School': 'https://www.tbs-education.com',
  'University of Geneva': 'https://www.unige.ch',
  'University of Manheim': 'https://www.uni-mannheim.de',
  'University of Maryland': 'https://umd.edu',
  'University of Rhode Island': 'https://www.uri.edu',
  'University of San Diego': 'https://www.sandiego.edu',
  'University of St.Gallen': 'https://www.unisg.ch',
  'University of Technology Sydney': 'https://www.uts.edu.au',
}

const partnerUniversityCoordinates = {
  'Audencia Nantes School of Management': [47.2184, -1.5536],
  'Bocconi University': [45.4506, 9.1883],
  'EM Normandie Business School': [49.4944, 0.1079],
  'Esade Business School': [41.3919, 2.1136],
  'ESC Rennes School of Business': [48.1173, -1.6778],
  'Essec School of Business': [49.033, 2.08],
  'Goethe University': [50.126, 8.667],
  'Hanyang University': [37.557, 127.045],
  'HEC School of Management': [48.758, 2.169],
  'IE Business School': [40.439, -3.691],
  'Indian Institute of Management Bangalore': [12.935, 77.605],
  'KEDGE Business School': [44.792, -0.607],
  'Kogod School of Business': [38.937, -77.087],
  'National Chengchi University': [24.988, 121.576],
  'National Taiwan University': [25.017, 121.54],
  'Neoma Business School': [49.238509, 4.002832],
  'Paris School of Business': [48.853, 2.35],
  'Rotterdam School of Management': [51.917, 4.525],
  'Skema Business School': [43.615, 7.073],
  'Toulouse Business School': [43.605, 1.444],
  'University of Geneva': [46.198, 6.14],
  'University of Manheim': [49.483, 8.463],
  'University of Maryland': [38.986, -76.944],
  'University of Rhode Island': [41.484, -71.53],
  'University of San Diego': [32.771, -117.188],
  'University of St.Gallen': [47.431, 9.373],
  'University of Technology Sydney': [-33.883, 151.201],
}

const partnerUniversityFlags = {
  'Audencia Nantes School of Management': '🇫🇷',
  'Bocconi University': '🇮🇹',
  'EM Normandie Business School': '🇫🇷',
  'Esade Business School': '🇪🇸',
  'ESC Rennes School of Business': '🇫🇷',
  'Essec School of Business': '🇫🇷',
  'Goethe University': '🇩🇪',
  'Hanyang University': '🇰🇷',
  'HEC School of Management': '🇫🇷',
  'IE Business School': '🇪🇸',
  'Indian Institute of Management Bangalore': '🇮🇳',
  'KEDGE Business School': '🇫🇷',
  'Kogod School of Business': '🇺🇸',
  'National Chengchi University': '🇹🇼',
  'National Taiwan University': '🇹🇼',
  'Neoma Business School': '🇫🇷',
  'Paris School of Business': '🇫🇷',
  'Rotterdam School of Management': '🇳🇱',
  'Skema Business School': '🇫🇷',
  'Toulouse Business School': '🇫🇷',
  'University of Geneva': '🇨🇭',
  'University of Manheim': '🇩🇪',
  'University of Maryland': '🇺🇸',
  'University of Rhode Island': '🇺🇸',
  'University of San Diego': '🇺🇸',
  'University of St.Gallen': '🇨🇭',
  'University of Technology Sydney': '🇦🇺',
}

const partnerUniversityAirports = {
  'Audencia Nantes School of Management': { name: 'Nantes Atlantique Airport', code: 'NTE', coordinates: [-1.61, 47.153], distanceKm: 9, driveMinutes: 18 },
  'Bocconi University': { name: 'Milan Linate Airport', code: 'LIN', coordinates: [9.276, 45.445], distanceKm: 6, driveMinutes: 15 },
  'EM Normandie Business School': { name: 'Deauville–Normandie Airport', code: 'DOL', coordinates: [0.16, 49.365], distanceKm: 76, driveMinutes: 65 },
  'Esade Business School': { name: 'Barcelona–El Prat Airport', code: 'BCN', coordinates: [2.083, 41.297], distanceKm: 27, driveMinutes: 35 },
  'ESC Rennes School of Business': { name: 'Rennes–Saint-Jacques Airport', code: 'RNS', coordinates: [-1.734, 48.069], distanceKm: 8, driveMinutes: 18 },
  'Essec School of Business': { name: 'Paris Charles de Gaulle Airport', code: 'CDG', coordinates: [2.55, 49.009], distanceKm: 32, driveMinutes: 42 },
  'Goethe University': { name: 'Frankfurt Airport', code: 'FRA', coordinates: [8.562, 50.038], distanceKm: 14, driveMinutes: 22 },
  'Hanyang University': { name: 'Gimpo International Airport', code: 'GMP', coordinates: [126.79, 37.558], distanceKm: 20, driveMinutes: 35 },
  'HEC School of Management': { name: 'Paris Orly Airport', code: 'ORY', coordinates: [2.359, 48.728], distanceKm: 25, driveMinutes: 35 },
  'IE Business School': { name: 'Adolfo Suárez Madrid–Barajas Airport', code: 'MAD', coordinates: [-3.561, 40.472], distanceKm: 14, driveMinutes: 25 },
  'Indian Institute of Management Bangalore': { name: 'Kempegowda International Airport', code: 'BLR', coordinates: [77.706, 13.198], distanceKm: 42, driveMinutes: 70 },
  'KEDGE Business School': { name: 'Bordeaux–Mérignac Airport', code: 'BOD', coordinates: [-0.715, 44.828], distanceKm: 12, driveMinutes: 25 },
  'Kogod School of Business': { name: 'Ronald Reagan Washington National Airport', code: 'DCA', coordinates: [-77.04, 38.852], distanceKm: 8, driveMinutes: 20 },
  'National Chengchi University': { name: 'Taiwan Taoyuan International Airport', code: 'TPE', coordinates: [121.233, 25.077], distanceKm: 45, driveMinutes: 55 },
  'National Taiwan University': { name: 'Taiwan Taoyuan International Airport', code: 'TPE', coordinates: [121.233, 25.077], distanceKm: 45, driveMinutes: 50 },
  'Neoma Business School': { name: 'Paris Charles de Gaulle Airport', code: 'CDG', coordinates: [2.55, 49.009], distanceKm: 140, driveMinutes: 95 },
  'Paris School of Business': { name: 'Paris Orly Airport', code: 'ORY', coordinates: [2.359, 48.728], distanceKm: 18, driveMinutes: 30 },
  'Rotterdam School of Management': { name: 'Rotterdam The Hague Airport', code: 'RTM', coordinates: [4.438, 51.948], distanceKm: 8, driveMinutes: 20 },
  'Skema Business School': { name: 'Nice Côte d’Azur Airport', code: 'NCE', coordinates: [7.215, 43.665], distanceKm: 25, driveMinutes: 35 },
  'Toulouse Business School': { name: 'Toulouse–Blagnac Airport', code: 'TLS', coordinates: [1.364, 43.629], distanceKm: 10, driveMinutes: 20 },
  'University of Geneva': { name: 'Geneva Airport', code: 'GVA', coordinates: [6.109, 46.238], distanceKm: 7, driveMinutes: 15 },
  'University of Manheim': { name: 'Frankfurt Airport', code: 'FRA', coordinates: [8.562, 50.038], distanceKm: 75, driveMinutes: 50 },
  'University of Maryland': { name: 'Baltimore/Washington International Airport', code: 'BWI', coordinates: [-76.668, 39.175], distanceKm: 45, driveMinutes: 45 },
  'University of Rhode Island': { name: 'T. F. Green International Airport', code: 'PVD', coordinates: [-71.429, 41.724], distanceKm: 10, driveMinutes: 20 },
  'University of San Diego': { name: 'San Diego International Airport', code: 'SAN', coordinates: [-117.19, 32.733], distanceKm: 6, driveMinutes: 15 },
  'University of St.Gallen': { name: 'Zurich Airport', code: 'ZRH', coordinates: [8.555, 47.458], distanceKm: 80, driveMinutes: 70 },
  'University of Technology Sydney': { name: 'Sydney Airport', code: 'SYD', coordinates: [151.177, -33.946], distanceKm: 7, driveMinutes: 15 },
}

const mapStyles = [
  { id: 'dark', label: 'Dark', url: 'mapbox://styles/mapbox/dark-v11' },
  { id: 'streets', label: 'Streets', url: 'mapbox://styles/mapbox/streets-v12' },
  { id: 'light', label: 'Light', url: 'mapbox://styles/mapbox/light-v11' },
  { id: 'satellite', label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
]

function PartnerUniversityMap({ universities, homeUniversity, selectedUniversity, onSelect, onResetSelection, showAirport }) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const markers = useRef([])
  const airportMarker = useRef(null)
  const [styleId, setStyleId] = useState('streets')

  const addMarkers = useCallback(() => {
    if (!map.current) return
    markers.current.forEach((marker) => marker.remove())
    markers.current = universities.flatMap((university) => {
      if (university.latitude == null || university.longitude == null) return []
      const marker = new mapboxgl.Marker({ color: '#00d4ff' })
        .setLngLat([university.longitude, university.latitude])
        .addTo(map.current)
      marker.getElement().addEventListener('click', () => onSelect(university.university_id))
      return [marker]
    })
  }, [universities, onSelect])

  useEffect(() => {
    if (!mapContainer.current || homeUniversity?.longitude == null || homeUniversity?.latitude == null) return undefined
    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapStyles.find((style) => style.id === 'streets').url,
      center: [homeUniversity.longitude, homeUniversity.latitude],
      zoom: 12,
    })
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
    return () => {
      airportMarker.current?.remove()
      map.current?.remove()
      map.current = null
    }
  }, [homeUniversity])

  useEffect(() => {
    if (!map.current) return undefined
    addMarkers()
    return () => {
      markers.current.forEach((marker) => marker.remove())
      markers.current = []
    }
  }, [addMarkers])

  const drawAirportRoute = useCallback(() => {
    if (!map.current || !selectedUniversity) return
    const airport = partnerUniversityAirports[selectedUniversity.name]
    if (!airport?.coordinates || selectedUniversity.latitude == null || selectedUniversity.longitude == null) return
    airportMarker.current?.remove()
    airportMarker.current = new mapboxgl.Marker({ color: '#f0a500' })
      .setLngLat(airport.coordinates)
      .addTo(map.current)
    const sourceData = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [[selectedUniversity.longitude, selectedUniversity.latitude], airport.coordinates],
      },
    }
    if (map.current.getSource('airport-route')) {
      map.current.getSource('airport-route').setData(sourceData)
      return
    }
    map.current.addSource('airport-route', { type: 'geojson', data: sourceData })
    map.current.addLayer({
      id: 'airport-route-line',
      type: 'line',
      source: 'airport-route',
      paint: { 'line-color': '#f0a500', 'line-width': 4, 'line-dasharray': [2, 1] },
    })
  }, [selectedUniversity])

  const fitAirportRoute = useCallback(() => {
    if (!map.current || !selectedUniversity) return
    const airport = partnerUniversityAirports[selectedUniversity.name]
    if (!airport?.coordinates || selectedUniversity.latitude == null || selectedUniversity.longitude == null) return
    const bounds = new mapboxgl.LngLatBounds()
    bounds.extend([selectedUniversity.longitude, selectedUniversity.latitude])
    bounds.extend(airport.coordinates)
    map.current.fitBounds(bounds, {
      padding: { top: 100, right: 100, bottom: 100, left: 100 },
      maxZoom: 13,
      duration: 900,
    })
  }, [selectedUniversity])

  useEffect(() => {
    if (!map.current) return
    if (!showAirport) {
      airportMarker.current?.remove()
      airportMarker.current = null
      if (map.current.getLayer('airport-route-line')) map.current.removeLayer('airport-route-line')
      if (map.current.getSource('airport-route')) map.current.removeSource('airport-route')
      return
    }
    const showRoute = () => {
      drawAirportRoute()
      fitAirportRoute()
    }
    if (map.current.isStyleLoaded()) showRoute()
    else map.current.once('style.load', showRoute)
  }, [drawAirportRoute, fitAirportRoute, showAirport])

  const changeStyle = (nextStyleId) => {
    const nextStyle = mapStyles.find((style) => style.id === nextStyleId)
    if (!map.current || !nextStyle || nextStyleId === styleId) return
    onResetSelection()
    setStyleId(nextStyleId)
    map.current.once('style.load', addMarkers)
    map.current.setStyle(nextStyle.url)
  }

  useEffect(() => {
    if (!map.current || !selectedUniversity || selectedUniversity.latitude == null || selectedUniversity.longitude == null) return
    map.current.flyTo({ center: [selectedUniversity.longitude, selectedUniversity.latitude], zoom: 5, duration: 900 })
  }, [selectedUniversity])

  return (
    <div className="partner-directory__map-shell">
      <div className="partner-directory__map" ref={mapContainer} />
      <div className="partner-directory__map-styles" aria-label="Map style">
        {mapStyles.map((style) => (
          <button
            className={style.id === styleId ? 'partner-directory__map-style partner-directory__map-style--active' : 'partner-directory__map-style'}
            type="button"
            key={style.id}
            onClick={() => changeStyle(style.id)}
          >
            {style.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function PartnerUniversitiesRoute() {
  const [universities, setUniversities] = useState([])
  const [homeUniversity, setHomeUniversity] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedUniversityId, setSelectedUniversityId] = useState(null)
  const [showAirport, setShowAirport] = useState(false)

  useEffect(() => {
    let isCurrent = true
    const loadUniversities = async () => {
      let result = await supabase
        .from('partneruniversity')
        .select('university_id, name, logo_url, details, latitude, longitude')
        .order('name')
      if (result.error?.message.includes('latitude') || result.error?.message.includes('longitude')) {
        result = await supabase
          .from('partneruniversity')
          .select('university_id, name, logo_url, details')
          .order('name')
      }
      if (!isCurrent) return
      if (result.error) setError(result.error.message)
      else {
        const mappedUniversities = (result.data || []).map((university) => ({
          ...university,
          latitude: university.latitude ?? partnerUniversityCoordinates[university.name]?.[0],
          longitude: university.longitude ?? partnerUniversityCoordinates[university.name]?.[1],
        }))
        const kuwaitUniversity = mappedUniversities.find((university) => university.university_id === 4)
        const availableUniversities = mappedUniversities.filter((university) => university.university_id !== 4)
        setHomeUniversity(kuwaitUniversity || {
          university_id: 4,
          name: 'Kuwait University',
          details: 'Kuwait University is the home institution for this exchange directory.',
        })
        setUniversities(availableUniversities)
      }
      setIsLoading(false)
    }
    loadUniversities()

    return () => {
      isCurrent = false
    }
  }, [])

  const selectedUniversity = universities.find((university) => university.university_id === selectedUniversityId)
  const detailsUniversity = selectedUniversity || homeUniversity
  const selectUniversity = useCallback((universityId) => {
    setSelectedUniversityId(universityId)
    setShowAirport(false)
  }, [])

  return (
    <section className="partner-directory" aria-labelledby="partner-directory-heading">
      <div className="partner-directory__intro">
        <span className="auth-card__eyebrow">Global connections</span>
        <h1 id="partner-directory-heading">Our partner universities</h1>
        <p>Explore the institutions that make exchange opportunities around the world possible.</p>
      </div>
      {isLoading && <p className="partner-directory__status">Loading partner universities...</p>}
      {error && <p className="partner-directory__status partner-directory__status--error" role="alert">{error}</p>}
      {!isLoading && !error && universities.length === 0 && (
        <p className="partner-directory__status">No partner universities are available yet.</p>
      )}
      {!isLoading && !error && universities.length > 0 && (
        <>
          <div className="partner-directory__viewport">
            <div className="partner-directory__track">
              {[...universities, ...universities].map((university, index) => (
                <a
                  className="partner-directory__university"
                  href={partnerUniversityWebsites[university.name]}
                  target="_blank"
                  rel="noopener noreferrer"
                  key={`${university.university_id}-${index}`}
                  aria-hidden={index >= universities.length}
                  tabIndex={index >= universities.length ? -1 : undefined}
                >
                  <div className="partner-directory__logo">
                    {university.logo_url ? (
                      <img src={university.logo_url} alt="" />
                    ) : (
                      <span aria-hidden="true">{university.name.charAt(0)}</span>
                    )}
                  </div>
                  <p>{university.name}</p>
                </a>
              ))}
            </div>
          </div>
          <section className="partner-directory__browser" aria-label="Partner university directory">
            <aside className="partner-directory__list">
              <h2>Partner university directory</h2>
              <div className="partner-directory__list-scroll">
                {universities.map((university) => (
                  <button
                    className={university.university_id === selectedUniversityId ? 'partner-directory__list-item partner-directory__list-item--active' : 'partner-directory__list-item'}
                    type="button"
                    key={university.university_id}
                    onClick={() => selectUniversity(university.university_id)}
                  >
                    <span className="partner-directory__list-flag" aria-hidden="true">{partnerUniversityFlags[university.name] || '🌐'}</span>
                    {university.name}
                  </button>
                ))}
              </div>
            </aside>
            <div className="partner-directory__details">
              {detailsUniversity && (
                <>
                  <div className="partner-directory__details-copy">
                    <span className="auth-card__eyebrow">{selectedUniversity ? 'Selected partner' : 'Home'}</span>
                    <div className="partner-directory__selected-logo">
                      {detailsUniversity.logo_url ? (
                        <img src={detailsUniversity.logo_url} alt="" />
                      ) : (
                        <span aria-hidden="true">{detailsUniversity.name.charAt(0)}</span>
                      )}
                    </div>
                    <h2>{detailsUniversity.name}</h2>
                    <p>{detailsUniversity.details || 'University details are not available yet.'}</p>
                    {selectedUniversity && (
                      <div className="partner-directory__details-actions">
                        <button className="btn btn--secondary" type="button" onClick={() => setShowAirport((isVisible) => !isVisible)}>
                          {showAirport ? 'Hide closest airport' : 'Closest airport'}
                        </button>
                        {showAirport && (
                          <p className="partner-directory__airport" role="status">
                            {partnerUniversityAirports[selectedUniversity.name]?.name || 'Airport information is not available'} ({partnerUniversityAirports[selectedUniversity.name]?.code || '—'})
                            <span>
                              {partnerUniversityAirports[selectedUniversity.name]?.distanceKm ?? '—'} km by road · approximately {partnerUniversityAirports[selectedUniversity.name]?.driveMinutes ?? '—'} minutes by car
                            </span>
                          </p>
                        )}
                        <a className="btn btn--secondary" href={partnerUniversityWebsites[selectedUniversity.name]} target="_blank" rel="noopener noreferrer">
                          Visit university website
                        </a>
                      </div>
                    )}
                  </div>
                  <PartnerUniversityMap
                    universities={universities}
                    homeUniversity={homeUniversity}
                    selectedUniversity={selectedUniversity}
                    onSelect={selectUniversity}
                    onResetSelection={() => {
                      setSelectedUniversityId(null)
                      setShowAirport(false)
                    }}
                    showAirport={showAirport}
                  />
                </>
              )}
            </div>
          </section>
        </>
      )}
    </section>
  )
}

function Navbar({ session, onSignOut, theme, onThemeChange }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <nav className="navbar" aria-label="Main navigation">
      <Link to="/" className="navbar__brand" aria-label="Go to KU Exchange home">
        <span className="navbar__university-logo" aria-hidden="true">
          <img src={`${import.meta.env.BASE_URL}images/kulogolightmode.png`} alt="" className="navbar__university-logo--light" />
          <img src={`${import.meta.env.BASE_URL}images/kulogodarkmode.png`} alt="" className="navbar__university-logo--dark" />
        </span>
        <span className="navbar__brand-text">KU Exchange</span>
      </Link>

      <button
        className="navbar__toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label="Toggle navigation"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none">
          <path d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <ul className={`navbar__links ${isOpen ? 'navbar__links--open' : ''}`} role="list">
        <li>
          <Link to="/" className="navbar__link">Home</Link>
        </li>
        <li>
          <button className="navbar__link navbar__theme-toggle" type="button" onClick={onThemeChange} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
        </li>
        <li>
          <Link to="/auth/signup" className="navbar__link navbar__link--auth">Sign Up</Link>
        </li>
        <li>
          <Link to="/auth/signin" className="navbar__link navbar__link--auth navbar__link--auth-alt">Log In</Link>
        </li>
        {session && (
          <li>
            <button className="navbar__link navbar__link--logout" type="button" onClick={onSignOut}>Log out</button>
          </li>
        )}
        <li>
          <Link to="/partners" className="navbar__link">
            {/* Handshake / partnership icon */}
            <svg className="navbar__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M16 8l-4-4-4 4M12 4v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 13l-3 3a2 2 0 0 0 2.83 2.83L11 15.66M16 13l3 3a2 2 0 0 1-2.83 2.83L13 15.66M11 15.66l1 1 1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Partner Universities
          </Link>
        </li>
        <li>
          <a
            href="https://www.ku.edu.kw"
            target="_blank"
            rel="noopener noreferrer"
            className="navbar__link"
          >
            Kuwait University
          </a>
        </li>
        <li>
          <Link to={session ? '/portal' : '/auth/signin'} className="navbar__link navbar__link--cta">Portal</Link>
        </li>
      </ul>
    </nav>
  )
}

function HeroBackground() {
  return (
    <div className="hero-bg" aria-hidden="true">
      <div className="hero-orb hero-orb--1" />
      <div className="hero-orb hero-orb--2" />
      <div className="hero-orb hero-orb--3" />
      <div className="hero-orb hero-orb--4" />
      <div className="hero-orb hero-orb--5" />
      {/* Animated grid lines */}
      <div className="hero-grid" />
    </div>
  )
}

function HeroSection() {
  return (
    <section className="hero-section" aria-label="Student Exchange Program">
      <HeroBackground />
      <div className="hero-section__inner">
        <div className="hero-section__badge">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          Kuwait University College of Business Administration
        </div>
        <img
          src={`${import.meta.env.BASE_URL}images/exchangelogoeng.png`}
          alt="Student Exchange Program"
          className="hero-section__logo"
        />
        <p className="hero-section__subtitle">
          Broaden your academic horizons by studying at one of our world-class partner
          universities — or welcome international scholars to our campus.
        </p>
        <div className="hero-section__actions">
          <a href="#incoming-application" className="btn btn--primary">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="20" height="20">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Apply as Incoming Student
          </a>
          <a href="#outgoing-application" className="btn btn--secondary">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="20" height="20">
              <path d="M12 21V9m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 4h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Apply as Outgoing Student
          </a>
        </div>
      </div>
    </section>
  )
}


const stats = [
  { value: '25+', label: 'Partner Universities' },
  { value: '12', label: 'Countries' },
  { value: '500+', label: 'Alumni Exchanged' },
  { value: '2', label: 'Semesters per Year' },
]

function StatsBar() {
  return (
    <div className="stats-bar" aria-label="Program at a glance">
      {stats.map(({ value, label }) => (
        <div key={label} className="stats-bar__item">
          <span className="stats-bar__value">{value}</span>
          <span className="stats-bar__label">{label}</span>
        </div>
      ))}
    </div>
  )
}

function EligibilityCriteria() {
  const [gpa, setGpa] = useState('')
  const [creditsPassed, setCreditsPassed] = useState('')
  const hasEnteredBoth = gpa !== '' && creditsPassed !== ''
  const exceedsMaximumGpa = gpa !== '' && Number(gpa) > 4
  const isBelowMinimumGpa = gpa !== '' && Number(gpa) < 3
  const meetsGpaRequirement = !isBelowMinimumGpa && !exceedsMaximumGpa
  const meetsCreditsRequirement = Number.isInteger(Number(creditsPassed))
    && Number(creditsPassed) >= 60
    && Number(creditsPassed) < 103
  const isEligible = meetsGpaRequirement && meetsCreditsRequirement

  return (
    <section id="eligibility" className="info-cards" aria-labelledby="eligibility-heading">
      <h2 id="eligibility-heading" className="section-heading">Eligibility Criteria</h2>
      <p className="section-subheading">
        Enter your academic details to check your outbound exchange eligibility.
      </p>
      <div className="eligibility-check">
        <div className="eligibility-check__fields">
          <label className="eligibility-check__field">
            GPA
            <input
              type="number"
              min="0"
              max="4"
              step="any"
              value={gpa}
              onChange={(event) => setGpa(event.target.value)}
              aria-label="GPA"
              aria-invalid={exceedsMaximumGpa}
              aria-describedby={exceedsMaximumGpa ? 'gpa-error' : undefined}
            />
            {exceedsMaximumGpa && <span id="gpa-error" className="eligibility-check__error" role="alert">GPA must be 4.0 or less.</span>}
          </label>
          <label className="eligibility-check__field">
            Credits passed
            <input
              type="number"
              min="0"
              step="1"
              value={creditsPassed}
              onChange={(event) => setCreditsPassed(event.target.value)}
              aria-label="Credits passed"
            />
          </label>
        </div>
        {hasEnteredBoth ? (
          <div className={`eligibility-check__result${isEligible ? ' eligibility-check__result--eligible' : ' eligibility-check__result--ineligible'}`} aria-live="polite">
            <h3>{isEligible ? 'You meet the eligibility criteria' : 'You do not meet the eligibility criteria'}</h3>
            <p>
              Eligibility requires a GPA of at least 3.0 and 60-102 credits passed.
              {exceedsMaximumGpa && ' Your GPA cannot be greater than 4.0.'}
              {isBelowMinimumGpa && ' Your GPA is below 3.0.'}
              {!meetsCreditsRequirement && ' Your passed credits must be a whole number from 60 through 102.'}
            </p>
          </div>
        ) : (
          <p className="eligibility-check__hint" aria-live="polite">
            Enter both values to see the eligibility criteria and result.
          </p>
        )}
      </div>
    </section>
  )
}

const infoCards = [
  {
    id: 'duration',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Duration',
    body: 'Exchange periods last one full semester or one academic year, aligned with the host institution\'s academic calendar.',
  },
  {
    id: 'credits',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Credit Transfer',
    body: 'Courses taken abroad are reviewed by the Academic Council and — when equivalent — transferred directly to your KU transcript.',
  },
  {
    id: 'financial',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Financial Support',
    body: 'Selected students may be eligible for KU travel grants and fee waivers. Tuition is paid to Kuwait University; partner tuition is waived under bilateral agreements.',
  },
]

function InfoCards() {
  return (
    <section className="info-cards" aria-labelledby="program-details-heading">
      <h2 id="program-details-heading" className="section-heading">Program Details</h2>
      <div className="info-cards__grid">
        {infoCards.map(({ id, icon, title, body }) => (
          <article key={id} className="info-card">
            <div className="info-card__icon">{icon}</div>
            <h3 className="info-card__title">{title}</h3>
            <p className="info-card__body">{body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

const partners = [
  { name: 'University of Edinburgh', country: 'United Kingdom', flag: '🇬🇧' },
  { name: 'Université Paris-Sorbonne', country: 'France', flag: '🇫🇷' },
  { name: 'University of Toronto', country: 'Canada', flag: '🇨🇦' },
  { name: 'Seoul National University', country: 'South Korea', flag: '🇰🇷' },
  { name: 'University of Melbourne', country: 'Australia', flag: '🇦🇺' },
  { name: 'Maastricht University', country: 'Netherlands', flag: '🇳🇱' },
]

const isoCountryCodes = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW`.split(' ')
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
const nationalityOptions = isoCountryCodes.filter((code) => code !== 'XK')
  .map((code) => regionNames.of(code))
  .sort((first, second) => first.localeCompare(second))

const visaGuidance = {
  'United Kingdom': {
    short: {
      status: 'ETA or visitor route for short study',
      category: 'Electronic travel authorisation (ETA) or visitor permission',
      timeline: 'Allow at least 3 weeks if a visitor visa is needed; check ETA processing before booking.',
      source: 'https://www.gov.uk/standard-visitor/visit-to-study',
      sourceLabel: 'UK study as a Standard Visitor guidance',
    },
    semester: {
      status: 'Visitor route for study up to 6 months',
      category: 'Visitor permission and an ETA where required',
      timeline: 'Allow at least 3 weeks if a visitor visa is needed; check ETA processing before booking.',
      source: 'https://www.gov.uk/standard-visitor/visit-to-study',
      sourceLabel: 'UK study as a Standard Visitor guidance',
    },
    year: {
      status: 'Student visa required',
      category: 'UK Student visa',
      timeline: 'Usually 3 weeks for applications made outside the UK.',
      source: 'https://www.gov.uk/student-visa',
      sourceLabel: 'UK Student visa and processing time',
    },
  },
  France: {
    short: {
      status: 'Short-stay visa-free travel may apply',
      category: 'Short-stay Schengen entry rules',
      timeline: 'Check France-Visas for current appointment and processing times before travel.',
      source: 'https://france-visas.gouv.fr/en/short-stay-visa',
      sourceLabel: 'France-Visas short-stay guidance',
    },
    semester: {
      status: 'Student visa required',
      category: 'Long-stay student visa (check course duration and visa type)',
      timeline: 'Apply well in advance; processing time depends on the consulate and season.',
      source: 'https://france-visas.gouv.fr/en/student',
      sourceLabel: 'France-Visas student guidance',
    },
    year: {
      status: 'Student visa required',
      category: 'Long-stay student visa',
      timeline: 'Apply well in advance; processing time depends on the consulate and season.',
      source: 'https://france-visas.gouv.fr/en/student',
      sourceLabel: 'France-Visas student guidance',
    },
  },
  Canada: {
    short: {
      status: 'Visitor visa required for Kuwaiti passport holders',
      category: 'Canadian visitor visa; a study permit is generally not needed for study lasting 6 months or less',
      timeline: 'Allow 4-8 weeks as a planning estimate; check current processing times.',
      source: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/entry-requirements-country.html',
      sourceLabel: 'Canada entry requirements by country',
    },
    semester: {
      status: 'Visitor visa required for Kuwaiti passport holders',
      category: 'Canadian visitor visa; a study permit is generally not needed for study lasting 6 months or less',
      timeline: 'Allow 4-8 weeks as a planning estimate; check current processing times.',
      source: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html',
      sourceLabel: 'Canada study permit guidance',
    },
    year: {
      status: 'Study permit and visitor visa required',
      category: 'Canadian study permit and entry visa',
      timeline: 'Allow 4-8 weeks as a planning estimate; check current processing times.',
      source: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html',
      sourceLabel: 'Canada study permit guidance',
    },
  },
  'South Korea': {
    short: {
      status: 'Study visa category must be confirmed',
      category: 'Confirm the short-term study visa category for your course',
      timeline: 'Check the Korean Visa Portal and the embassy for current processing times.',
      source: 'https://www.visa.go.kr/openPage.do?MENU_ID=10101',
      sourceLabel: 'Korea Visa Portal',
    },
    semester: {
      status: 'Student visa required for exchange study',
      category: 'Exchange-student visa category; confirm with the Korean embassy',
      timeline: 'Apply well in advance; check current processing times with the embassy.',
      source: 'https://www.visa.go.kr/openPage.do?MENU_ID=10101',
      sourceLabel: 'Korea Visa Portal',
    },
    year: {
      status: 'Student visa required for exchange study',
      category: 'Exchange-student visa category; confirm with the Korean embassy',
      timeline: 'Apply well in advance; check current processing times with the embassy.',
      source: 'https://www.visa.go.kr/openPage.do?MENU_ID=10101',
      sourceLabel: 'Korea Visa Portal',
    },
  },
  Australia: {
    short: {
      status: 'Visitor visa required',
      category: 'Visitor visa; visitor visas generally allow study for up to 3 months',
      timeline: 'Allow 4-8 weeks as a planning estimate; check current processing times.',
      source: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/visitor-600',
      sourceLabel: 'Australian Visitor visa (subclass 600)',
    },
    semester: {
      status: 'Student visa required',
      category: 'Student visa (subclass 500)',
      timeline: 'Allow 4-8 weeks as a planning estimate; check current processing times.',
      source: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500',
      sourceLabel: 'Australian Student visa (subclass 500)',
    },
    year: {
      status: 'Student visa required',
      category: 'Student visa (subclass 500)',
      timeline: 'Allow 4-8 weeks as a planning estimate; check current processing times.',
      source: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500',
      sourceLabel: 'Australian Student visa (subclass 500)',
    },
  },
  Netherlands: {
    short: {
      status: 'Short-stay visa-free travel may apply',
      category: 'Short-stay Schengen entry rules',
      timeline: 'Check the Netherlands Worldwide visa checker for current requirements and timing.',
      source: 'https://www.netherlandsworldwide.nl/visa-the-netherlands/visa-required',
      sourceLabel: 'Netherlands Worldwide visa checker',
    },
    semester: {
      status: 'Student residence permit may be required',
      category: 'Student residence permit; the host institution usually submits the application',
      timeline: 'Start with the host university well in advance; check its current processing guidance.',
      source: 'https://ind.nl/en/residence-permits/study',
      sourceLabel: 'Dutch IND student residence permit guidance',
    },
    year: {
      status: 'Student residence permit required',
      category: 'Student residence permit; the host institution usually submits the application',
      timeline: 'Start with the host university well in advance; check its current processing guidance.',
      source: 'https://ind.nl/en/residence-permits/study',
      sourceLabel: 'Dutch IND student residence permit guidance',
    },
  },
}

function VisaRequirementAdvisory() {
  const [nationality, setNationality] = useState('Kuwait')
  const [destination, setDestination] = useState('')
  const [duration, setDuration] = useState('')
  const guidance = nationality === 'Kuwait' && destination && duration
    ? visaGuidance[destination]?.[duration]
    : null

  return (
    <section className="visa-advisory" aria-labelledby="visa-advisory-heading">
      <h2 id="visa-advisory-heading" className="section-heading">Visa Requirement Advisory</h2>
      <p className="section-subheading">
        Check preliminary study visa guidance for a partner destination.
      </p>
      <div className="visa-advisory__form">
        <label className="visa-advisory__field">
          Nationality
          <input
            list="visa-nationalities"
            value={nationality}
            onChange={(event) => setNationality(event.target.value)}
            autoComplete="country-name"
            aria-label="Nationality"
          />
          <datalist id="visa-nationalities">
            {nationalityOptions.map((option) => <option key={option} value={option} />)}
          </datalist>
        </label>
        <label className="visa-advisory__field">
          Partner university / destination
          <select value={destination} onChange={(event) => setDestination(event.target.value)}>
            <option value="">Select a destination</option>
            {partners.map(({ name, country }) => (
              <option key={name} value={country}>{name} — {country}</option>
            ))}
          </select>
        </label>
        <label className="visa-advisory__field">
          Study duration
          <select value={duration} onChange={(event) => setDuration(event.target.value)}>
            <option value="">Select a duration</option>
            <option value="short">Short visit (up to 90 days)</option>
            <option value="semester">One semester (91 days to 6 months)</option>
            <option value="year">Full academic year (over 6 months)</option>
          </select>
        </label>
      </div>
      {nationality && destination && duration && (
        <div className="visa-advisory__result" aria-live="polite">
          {nationality === 'Kuwait' && guidance ? (
            <>
              <span className="visa-advisory__badge">{guidance.status}</span>
              <h3>Preliminary guidance for Kuwaiti nationals</h3>
              <p><strong>Visa category:</strong> {guidance.category}</p>
              <p><strong>Estimated timeline:</strong> {guidance.timeline}</p>
              <h4>Prepare these documents</h4>
              <ul>
                <li>Valid passport; check the destination’s validity requirements (many require at least 6 months).</li>
                <li>Official Kuwait University nomination letter and host-university acceptance letter.</li>
                <li>Completed visa application, recent photographs, proof of funds, and travel/health insurance if required.</li>
              </ul>
              <a href={guidance.source} target="_blank" rel="noreferrer">
                Verify requirements with {guidance.sourceLabel}
              </a>
              <p className="visa-advisory__disclaimer">
                This is a preliminary guide, not an immigration decision. Rules vary by course and individual circumstances; verify current requirements with the official authority before applying or booking.
              </p>
            </>
          ) : (
            <p className="visa-advisory__disclaimer">
              This curated advisory currently covers Kuwaiti nationals only. Check the destination country’s official immigration guidance for your selected nationality.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function PartnerUniversities() {
  return (
    <section id="partner-universities" className="partners" aria-labelledby="partners-heading">
      <h2 id="partners-heading" className="section-heading">Partner Universities</h2>
      <p className="section-subheading">
        We collaborate with leading institutions across the globe.
      </p>
      <ul className="partners__grid" role="list">
        {partners.map(({ name, country, flag }) => (
          <li key={name} className="partner-card">
            <span className="partner-card__flag" aria-hidden="true">{flag}</span>
            <div>
              <p className="partner-card__name">{name}</p>
              <p className="partner-card__country">{country}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ApplicationCTA() {
  return (
    <section className="apply-cta" aria-labelledby="apply-cta-heading">
      <h2 id="apply-cta-heading" className="apply-cta__heading">Ready to Begin?</h2>
      <p className="apply-cta__body">
        Choose the application that matches your situation and follow the guided steps.
        Our International Relations Office is available to help throughout the process.
      </p>
      <div className="apply-cta__cards">
        <div id="incoming-application" className="apply-card apply-card--incoming">
          <div className="apply-card__icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h3 className="apply-card__title">Incoming Student</h3>
          <p className="apply-card__description">
            You are an international student wishing to study at Kuwait University for a
            semester or a full academic year.
          </p>
          <a href="#incoming-form" className="btn btn--primary btn--full">
            Start Incoming Application
          </a>
        </div>

        <div id="outgoing-application" className="apply-card apply-card--outgoing">
          <div className="apply-card__icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 21V9m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 4h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h3 className="apply-card__title">Outgoing Student</h3>
          <p className="apply-card__description">
            You are a KU student wishing to study abroad at one of our partner universities
            for a semester or a full academic year.
          </p>
          <a href="#outgoing-form" className="btn btn--secondary btn--full">
            Start Outgoing Application
          </a>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer__content">
        <div className="footer__section">
          <h4 className="footer__heading">Main Links</h4>
          <ul className="footer__links">
            <li><a href="#" className="footer__link">Contact Us</a></li>
          </ul>
        </div>
        <div className="footer__section">
          <h4 className="footer__heading">Legacy Documents</h4>
          <ul className="footer__links">
            <li><a href={`${import.meta.env.BASE_URL}docs/proposal.html`} className="footer__link">Proposal</a></li>
            <li>            <Link to="/erd" className="footer__link">Schema and ERD</Link></li>
            <li><Link to="/test-status" className="footer__link">Test and Status</Link></li>
          </ul>
        </div>
      </div>
      <p className="footer__text">
        © {new Date().getFullYear()} Kuwait University · College of Business Administration ·
        International Relations Office
      </p>
    </footer>
  )
}

function TestStatusPage() {
  const [status, setStatus] = useState('checking')
  const [countries, setCountries] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const loadStatus = async () => {
      const { data, error: countryError } = await supabase
        .from('country')
        .select('id, name, city')
        .order('name')

      if (countryError) {
        setStatus('failure')
        setError(countryError.message)
        return
      }

      setCountries(data || [])
      setStatus('success')
    }

    loadStatus()
  }, [])

  return (
    <section className="status-page" aria-labelledby="status-heading">
      <div className="status-card">
        <span className="auth-card__eyebrow">System diagnostics</span>
        <h1 id="status-heading">Test and Status</h1>
        <div className="database-status">
          <span className={`database-status__dot database-status__dot--${status}`} aria-hidden="true" />
          <strong>Database connection: {status === 'checking' ? 'Checking...' : status === 'success' ? 'Connected' : 'Failed'}</strong>
        </div>
        {error && <p className="auth-form__error" role="alert">{error}</p>}
        <div className="status-graph" aria-label="Animated database activity graph">
          {[35, 58, 42, 76, 50, 82, 61, 90, 48, 70, 55, 85].map((height, index) => (
            <span key={index} style={{ height: `${height}%`, animationDelay: `${index * 0.12}s` }} />
          ))}
        </div>
        <h2 className="portal-section-heading">Countries loaded from database</h2>
        {countries.length === 0 ? <p>No countries returned.</p> : (
          <ul className="country-list">
            {countries.map((country) => (
              <li key={country.id}><strong>{country.name}</strong>{country.city ? ` · ${country.city}` : ''}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('team2-theme') || 'light')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('team2-theme', theme)
  }, [theme])

  useEffect(() => {
    const loadProfile = async (nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        return
      }
      const userType = nextSession.user.user_metadata?.user_type || nextSession.user.user_metadata?.student_type
      const profileTables = userType === 'coordinator'
        ? [['coordinator', 'coordinator_id']]
        : userType === 'incoming'
          ? [['incomingstudentauth', 'student_id']]
          : userType === 'ku'
            ? [['kustudentauth', 'student_id']]
            : [['kustudentauth', 'student_id'], ['incomingstudentauth', 'student_id'], ['coordinator', 'coordinator_id']]
      for (const [table] of profileTables) {
        const { data } = await supabase.from(table).select('*').eq('user_id', nextSession.user.id).maybeSingle()
        if (data) {
          const role = table === 'coordinator' ? 'coordinator' : table === 'incomingstudentauth' ? 'incoming' : 'ku'
          setProfile({ ...data, role })
          return
        }
      }
      setProfile({ name: nextSession.user.user_metadata?.name, role: userType })
    }

    supabase.auth.getSession().then(({ data }) => loadProfile(data.session))
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      loadProfile(nextSession)
    })
    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) window.alert(error.message)
  }

  const handleDeleted = () => {
    window.location.hash = '/auth/signin'
  }

  return (
    <>
      <Navbar
        session={session}
        onSignOut={handleSignOut}
        theme={theme}
        onThemeChange={() => setTheme((currentTheme) => currentTheme === 'light' ? 'dark' : 'light')}
      />
      <main>
        <Routes>
          <Route path="/" element={
            <>
              <HeroSection />
              <StatsBar />
              <EligibilityCriteria />
              <VisaRequirementAdvisory />
              <InfoCards />
              <PartnerUniversities />
              <ApplicationCTA />
            </>
          } />
          <Route path="/auth/signup" element={<AuthRoute mode="signup" />} />
          <Route path="/auth/signin" element={<AuthRoute mode="signin" />} />
          <Route path="/portal" element={
            session ? <ProtectedPortal user={session.user} profile={profile} onSignOut={handleSignOut} onDeleted={handleDeleted} /> : <Navigate to="/auth/signin" replace />
          } />
          <Route path="/portal/inbound-application" element={session ? <section className="portal-page"><div className="portal-card"><h1>Inbound application</h1><p>This application area is ready for the next portal feature.</p></div></section> : <Navigate to="/auth/signin" replace />} />
          <Route path="/portal/outbound-application" element={session ? <section className="portal-page"><div className="portal-card"><h1>Outbound application</h1><p>This application area is ready for the next portal feature.</p></div></section> : <Navigate to="/auth/signin" replace />} />
          <Route path="/partners" element={<PartnerUniversitiesRoute />} />
          <Route path="/erd" element={<ErdPage />} />
          <Route path="/test-status" element={<TestStatusPage />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}

function AuthRoute({ mode }) {
  const navigate = useNavigate()
  const [type, setType] = useState('ku')

  return (
    <AuthPage
      type={type}
      mode={mode}
      onTypeChange={setType}
      onModeChange={(nextMode) => navigate(`/auth/${nextMode}`)}
      onAuthenticated={() => navigate('/portal')}
    />
  )
}

export default App
