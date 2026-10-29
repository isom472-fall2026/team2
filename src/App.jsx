import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import AscendHome from './components/AscendHome'
import SiteLoader from './components/SiteLoader'
import SiteNavbar from './components/SiteNavbar'
import DateField from './components/DateField'
import { supabase } from './supabase'
import { getDatabaseErrorMessage } from './databaseErrors'
import { useAppStore } from './stores/appStore'
import './App.css'

// Everything except the home page loads on demand, so the landing page does not download
// the map, PDF and application code before it can show anything.
const ErdPage = lazy(() => import('./ErdPage'))
const Blog = lazy(() => import('./Blog'))
const OutboundApplication = lazy(() => import('./components/OutboundApplication'))
const InboundApplication = lazy(() => import('./components/InboundApplication'))
const CoordinatorApplications = lazy(() => import('./components/CoordinatorApplications'))
const CoordinatorAccountSettings = lazy(() => import('./components/CoordinatorAccount'))
const CoordinatorPasswordPage = lazy(() => import('./components/CoordinatorAccount').then((module) => ({ default: module.CoordinatorPasswordPage })))
const TestingMode = lazy(() => import('./components/TestingMode'))
const PartnerUniversityMap = lazy(() => import('./components/PartnerUniversityMap'))

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

async function readMaintenanceMode() {
  const { data, error } = await supabase.rpc('get_maintenance_mode')
  if (error) return { mode: null, error: getDatabaseErrorMessage(error) }
  if (data === null) {
    return {
      mode: null,
      error: 'Coordinator maintenance statuses are inconsistent. A KU coordinator must reconcile them before the website status can be confirmed.',
    }
  }
  if (typeof data !== 'boolean') {
    return { mode: null, error: 'The maintenance status returned an unexpected value.' }
  }
  return { mode: data, error: '' }
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

// Every visitor sees only this while maintenance mode is on. The sign-in sits in the corner
// because it is for KU coordinators, who sign in to switch maintenance off.
function MaintenanceScreen({ theme }) {
  return (
    <div className="ascend-home" data-theme={theme}>
      <main className="maintenance-screen" aria-labelledby="maintenance-heading">
        <Link className="maintenance-screen__signin" to="/auth/signin">KU coordinator sign in</Link>
        <div className="maintenance-screen__message">
          <span className="ascend-loader-mark">Kuwait University</span>
          <h1 id="maintenance-heading">System is in maintenance</h1>
          <p>Please check back later.</p>
        </div>
      </main>
    </div>
  )
}

// Shown on every route while the website status is unknown, in the same look as the home
// page's loader, so the check reads as one screen wherever a visitor lands.
function StatusLoader({ theme, error, onRetry }) {
  return (
    <div className="ascend-home" data-theme={theme}>
      {error
        ? (
            <SiteLoader
              error
              message="We could not check the website status."
              detail={error}
              actions={
                <>
                  <button type="button" onClick={onRetry}>Retry</button>
                  <Link to="/auth/signin">KU coordinator sign in</Link>
                </>
              }
            />
          )
        : <SiteLoader />}
    </div>
  )
}

function AuthPage({ type, mode, onTypeChange, onModeChange, onAuthenticated, coordinatorOnly = false, sessionEndedMessage = '' }) {
  const options = authOptions[type]
  const isSignUp = mode === 'signup'
  const testingMode = useAppStore((state) => state.testingMode)
  const setTestingMode = useAppStore((state) => state.setTestingMode)
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
        if (universityError) setError(getDatabaseErrorMessage(universityError))
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
    let currentTestingMode = testingMode
    if (isSignUp && currentTestingMode === null) {
      const { data: testingStatus, error: testingError } = await supabase
        .from('testing')
        .select('enabled')
        .eq('id', 1)
        .single()
      if (testingError) {
        setError(getDatabaseErrorMessage(testingError))
        return
      }
      currentTestingMode = testingStatus.enabled
      setTestingMode(currentTestingMode)
    }
    if (isSignUp && type === 'ku' && !isKuEmail) {
      setError('KU students must use an email ending with @ku.edu.kw.')
      return
    }
    if (isSignUp && type === 'coordinator' && currentTestingMode && isKuEmail && isKuUniversity) {
      setError('KU coordinator accounts cannot be created while testing mode is enabled.')
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

    if (coordinatorOnly && !isSignUp) {
      const { data: coordinator, error: coordinatorError } = await supabase
        .from('coordinator')
        .select('coordinator_id, university, email')
        .eq('user_id', result.data.user.id)
        .maybeSingle()
      if (coordinatorError || !coordinator || !isKuCoordinatorProfile(coordinator, email)) {
        const { error: signOutError } = await supabase.auth.signOut()
        setError(signOutError?.message || (coordinatorError && getDatabaseErrorMessage(coordinatorError)) || 'Only authorized KU coordinators can sign in during maintenance.')
        setIsSubmitting(false)
        return
      }
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
        const profileErrorMessage = profileError.code === '23505'
          ? 'An account with this ID or email already exists.'
          : getDatabaseErrorMessage(profileError)
        if (result.data.session) {
          const { error: signOutError } = await supabase.auth.signOut()
          setError(signOutError
            ? `${profileErrorMessage} Sign-out failed: ${signOutError.message}`
            : profileErrorMessage)
        } else {
          setError(profileErrorMessage)
        }
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
        <span className="auth-card__eyebrow">{coordinatorOnly ? 'KU Coordinator' : options.label}</span>
        <h1 id="auth-heading">{coordinatorOnly ? 'Sign in as a KU coordinator' : isSignUp ? `Create your ${options.label} account` : `Sign in to the ${options.label} portal`}</h1>
        <p className="auth-card__description">
          {coordinatorOnly ? 'Sign in to disable maintenance mode and restore public access.' : options.description}
        </p>
        {sessionEndedMessage && <p className="session-ended-message" role="status">{sessionEndedMessage}</p>}
        {!coordinatorOnly && (
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
        )}
        {type === 'coordinator' && (
          <p className="auth-warning" role="alert">
            {coordinatorOnly
              ? 'Only authorized KU coordinators may sign in while maintenance mode is enabled.'
              : 'only for partner university coordinators, attempts at misuse by students will be caught and legally prosecuted'}
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
        {!coordinatorOnly && (
          <button className="auth-card__switch" type="button" onClick={() => onModeChange(isSignUp ? 'signin' : 'signup')}>
            {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
          </button>
        )}
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
      setError(getDatabaseErrorMessage(deleteError))
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
  if (dates.some(([, open, close]) => !open || !close || Number.isNaN(new Date(open).getTime()) || Number.isNaN(new Date(close).getTime()))) {
    return 'Enter valid opening and closing dates for every cycle stage.'
  }
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
          <DateField id="cycle-nominations-open" name="nominationsOpen" type="datetime-local" value={form.nominationsOpen} onChange={updateField} required />
        </label>
        <label htmlFor="cycle-nominations-close">Inbound nominations close
          <DateField id="cycle-nominations-close" name="nominationsClose" type="datetime-local" value={form.nominationsClose} onChange={updateField} required />
        </label>
        <label htmlFor="cycle-application-open">Applications open
          <DateField id="cycle-application-open" name="applicationOpen" type="datetime-local" value={form.applicationOpen} onChange={updateField} required />
        </label>
        <label htmlFor="cycle-application-close">Applications close
          <DateField id="cycle-application-close" name="applicationClose" type="datetime-local" value={form.applicationClose} onChange={updateField} required />
        </label>
        <label htmlFor="cycle-start">Exchange cycle starts
          <DateField id="cycle-start" name="cycleStart" type="datetime-local" value={form.cycleStart} onChange={updateField} required />
        </label>
        <label htmlFor="cycle-end">Exchange cycle ends
          <DateField id="cycle-end" name="cycleEnd" type="datetime-local" value={form.cycleEnd} onChange={updateField} required />
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

function CoordinatorPortal({ onDeleted, onSignOut, onRetryMaintenanceStatus }) {
  const profile = useAppStore((state) => state.profile)
  const userEmail = useAppStore((state) => state.session?.user.email)
  const maintenanceMode = useAppStore((state) => state.maintenanceMode)
  const setMaintenanceMode = useAppStore((state) => state.setMaintenanceMode)
  const profileEmailIsKu = profile.email?.trim().toLowerCase().endsWith('@ku.edu.kw')
  const authenticatedEmailIsKu = userEmail?.trim().toLowerCase().endsWith('@ku.edu.kw')
  const universityId = profile.university ?? profile.university_id
  const isKuCoordinator = Number(universityId) === 4
    || profileEmailIsKu
    || authenticatedEmailIsKu
  const [nominations, setNominations] = useState([])
  const [isLoadingNominations, setIsLoadingNominations] = useState(true)
  const [applicationStatuses, setApplicationStatuses] = useState({})
  const [isLoadingProgress, setIsLoadingProgress] = useState(!isKuCoordinator)
  const [progressError, setProgressError] = useState('')
  const [progressCycle, setProgressCycle] = useState('all')
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
  const [withdrawalRequests, setWithdrawalRequests] = useState([])
  const [isLoadingWithdrawals, setIsLoadingWithdrawals] = useState(isKuCoordinator)
  const [reviewingWithdrawalKey, setReviewingWithdrawalKey] = useState(null)
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
  const [maintenanceError, setMaintenanceError] = useState('')
  const [isUpdatingMaintenance, setIsUpdatingMaintenance] = useState(false)
  const dismissSuccess = useCallback(
    () => setStatus((currentStatus) => ({ ...currentStatus, message: '' })),
    [],
  )

  const handleMaintenanceToggle = async () => {
    if (maintenanceMode === null || isUpdatingMaintenance) return
    const nextMode = !maintenanceMode
    setIsUpdatingMaintenance(true)
    setMaintenanceError('')
    const { data, error } = await supabase.rpc('set_maintenance_mode', {
      requested_mode: nextMode,
    })
    setIsUpdatingMaintenance(false)
    if (error) {
      setMaintenanceError(getDatabaseErrorMessage(error))
      setStatus({ error: '', message: '' })
      return
    }
    if (data !== nextMode) {
      setMaintenanceError('The database did not confirm the requested maintenance status.')
      setStatus({ error: '', message: '' })
      return
    }
    setMaintenanceMode(data)
    setStatus({
      error: '',
      message: nextMode ? 'Maintenance mode enabled. Visitors will see the maintenance page.' : 'Maintenance mode disabled. The website is live again.',
    })
    setToastId((currentId) => currentId + 1)
  }

  const loadCycles = async () => {
    const { data, error } = await supabase
      .from('exchange_cycle')
      .select('id, semester, academic_year, nominations_o, nominations_c, application_o, application_c, cycle_start, cycle_end')
      .order('cycle_start', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
    if (error) {
      setStatus({ error: getDatabaseErrorMessage(error), message: '' })
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
      if (error) {
        const errorMessage = getDatabaseErrorMessage(error)
        setStatus({ error: errorMessage, message: '' })
        if (!isKuCoordinator) setProgressError(errorMessage)
        setIsLoadingProgress(false)
        setIsLoadingNominations(false)
        return
      }

      const loadedNominations = data || []
      setNominations(loadedNominations)
      setIsLoadingNominations(false)

      if (isKuCoordinator || loadedNominations.length === 0) {
        setApplicationStatuses({})
        setProgressError('')
        setIsLoadingProgress(false)
        return
      }

      const { data: applications, error: applicationError } = await supabase
        .from('inboundapplication')
        .select('nomination_id, application_status')
        .in('nomination_id', loadedNominations.map(({ id }) => id))
      if (!isCurrent) return

      if (applicationError) {
        setProgressError(getDatabaseErrorMessage(applicationError))
        setApplicationStatuses({})
      } else {
        setProgressError('')
        setApplicationStatuses(Object.fromEntries(
          (applications || []).map(({ nomination_id, application_status }) => [
            nomination_id,
            application_status,
          ]),
        ))
      }
      setIsLoadingProgress(false)
    }
    loadNominations()

    supabase
      .from('exchange_cycle')
      .select('id, semester, academic_year, nominations_o, nominations_c, application_o, application_c, cycle_start, cycle_end')
      .order('cycle_start', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .then(({ data, error }) => {
        if (error) setStatus({ error: getDatabaseErrorMessage(error), message: '' })
        else setCycles(data || [])
      })
    supabase.from('exchange_cycle').select('id, semester, academic_year').order('id').then(({ data, error }) => {
      if (error) setStatus({ error: getDatabaseErrorMessage(error), message: '' })
      else setSemesters(data || [])
    })
    if (isKuCoordinator) {
      supabase
        .from('coordinator')
        .select('coordinator_id, name, email, university, email_accepted')
        .neq('coordinator_id', profile.coordinator_id)
        .order('name')
        .then(({ data, error }) => {
          if (error) setStatus({ error: getDatabaseErrorMessage(error), message: '' })
          else setCoordinators(data || [])
          setIsLoadingCoordinators(false)
        })
      supabase
        .from('partneruniversity')
        .select('university_id, name')
        .order('name')
        .then(({ data, error }) => {
          if (error) setStatus({ error: getDatabaseErrorMessage(error), message: '' })
          else setPartnerUniversities(data || [])
        })
    }
    return () => {
      isCurrent = false
    }
  }, [profile.coordinator_id, isKuCoordinator])

  useEffect(() => {
    if (!isKuCoordinator) return undefined
    let isCurrent = true
    Promise.all([
      supabase
        .from('outboundapplication')
        .select('application_id, student_id, semester_applied_for, university_id, submitted_at, application_status, withdrawal_reason, withdrawal_previous_status, status_updated_at, student:kustudentauth(name, student_email)')
        .eq('application_status', 'Withdrawal Requested')
        .order('status_updated_at', { ascending: false }),
      supabase
        .from('inboundapplication')
        .select('application_id, student_id, semester_applied_for, university_id, submitted_at, application_status, withdrawal_reason, withdrawal_previous_status, status_updated_at, student:incomingstudentauth(name, student_email)')
        .eq('application_status', 'Withdrawal Requested')
        .order('status_updated_at', { ascending: false }),
    ]).then(([outboundResult, inboundResult]) => {
      if (!isCurrent) return
      const requestError = outboundResult.error || inboundResult.error
      if (requestError) setStatus({ error: getDatabaseErrorMessage(requestError), message: '' })
      else setWithdrawalRequests([
        ...(outboundResult.data || []).map((item) => ({ ...item, application_type: 'outbound' })),
        ...(inboundResult.data || []).map((item) => ({ ...item, application_type: 'inbound' })),
      ].sort((left, right) => new Date(right.status_updated_at) - new Date(left.status_updated_at)))
      setIsLoadingWithdrawals(false)
    })
    return () => { isCurrent = false }
  }, [isKuCoordinator])

  const reviewWithdrawal = async (application, approveRequest) => {
    const withdrawalKey = `${application.application_type}-${application.application_id}`
    if (reviewingWithdrawalKey) return

    setStatus({ error: '', message: '' })
    setReviewingWithdrawalKey(withdrawalKey)
    const { data, error } = await supabase.rpc(application.application_type === 'inbound'
      ? 'review_inbound_withdrawal'
      : 'review_outbound_withdrawal', {
      requested_application_id: Number(application.application_id),
      approve_request: approveRequest,
    })
    setReviewingWithdrawalKey(null)
    if (error || !data) {
      setStatus({
        error: error ? getDatabaseErrorMessage(error) : 'The withdrawal request was not updated. It may already have been reviewed.',
        message: '',
      })
      return
    }
    setWithdrawalRequests((current) => current.filter((item) => (
      item.application_type !== application.application_type
      || Number(item.application_id) !== Number(data.application_id)
    )))
    setStatus({ error: '', message: approveRequest ? 'Withdrawal approved.' : 'Withdrawal rejected and the previous status was restored.' })
    setToastId((currentId) => currentId + 1)
  }

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
        setStatus({ error: getDatabaseErrorMessage(error), message: '' })
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
        setStatus({ error: getDatabaseErrorMessage(error), message: '' })
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
      setStatus({ error: getDatabaseErrorMessage(duplicateCheckError), message: '' })
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
      setStatus({ error: getDatabaseErrorMessage(latestCycleError), message: '' })
      setIsStartingCycle(false)
      return
    }

    const { error } = await supabase.from('exchange_cycle').insert({
      id: (latestCycle?.id ?? 0) + 1,
      ...cycleDataFromForm(cycleForm),
    })
    if (error) {
      setStatus({ error: getDatabaseErrorMessage(error), message: '' })
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
      setStatus({ error: getDatabaseErrorMessage(duplicateCheckError), message: '' })
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
      setStatus({ error: getDatabaseErrorMessage(error), message: '' })
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
      setStatus({ error: getDatabaseErrorMessage(error), message: '' })
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
      setStatus({ error: error.code === '23505' ? 'A unique nomination ID could not be generated. Please try again.' : getDatabaseErrorMessage(error), message: '' })
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
      setStatus({ error: getDatabaseErrorMessage(refreshError), message: '' })
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
      setNominationEditError(getDatabaseErrorMessage(error))
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
      setStatus({ error: getDatabaseErrorMessage(error), message: '' })
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
  const visibleProgressNominations = progressCycle === 'all'
    ? nominations
    : nominations.filter(({ semester }) => Number(semester) === Number(progressCycle))

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
            <button className={activeView === 'start' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => {
              setStatus({ error: '', message: '' })
              setActiveView('start')
            }}>
              <span aria-hidden="true">＋</span> Start exchange cycle
            </button>
          )}
          <button className={activeView === 'manage' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('manage')}>
            <span aria-hidden="true">▦</span> Manage exchange cycle
          </button>
          <button className={activeView === 'nominations' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('nominations')}>
            <span aria-hidden="true">◌</span> Student nominations
          </button>
          <button className={activeView === 'account' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('account')}>
            <span aria-hidden="true">♙</span> My account
          </button>
          {!isKuCoordinator && (
            <button className={activeView === 'progress' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('progress')}>
              <span aria-hidden="true">▤</span> Nominee progress
            </button>
          )}
          {isKuCoordinator && (
            <button className={activeView === 'applications' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('applications')}>
              <span aria-hidden="true">▤</span> Applications
            </button>
          )}
          {isKuCoordinator && (
            <button className={activeView === 'withdrawals' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('withdrawals')}>
              <span aria-hidden="true">↩</span> Withdrawal requests
            </button>
          )}
          {isKuCoordinator && (
            <button className={activeView === 'coordinators' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('coordinators')}>
              <span aria-hidden="true">♙</span> Coordinator access
            </button>
          )}
          {isKuCoordinator && (
            <button className={activeView === 'maintenance' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('maintenance')}>
              <span aria-hidden="true">⚙</span> Maintenance mode
            </button>
          )}
          {isKuCoordinator && (
            <Link className="portal-sidebar__action" to="/testing-mode">
              <span aria-hidden="true">◉</span> Testing mode
            </Link>
          )}
        </nav>
        <div className="portal-sidebar__footer">
          <span className="portal-sidebar__secure">Signed in securely</span>
          {maintenanceMode && (
            <button className="btn btn--secondary" type="button" onClick={onSignOut}>Log out</button>
          )}
        </div>
      </aside>
      <section className="portal-card portal-card--wide portal-card--workspace">
        {activeView === 'account' && <Suspense fallback={null}><CoordinatorAccountSettings profile={profile} /></Suspense>}
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
        {isKuCoordinator && activeView === 'withdrawals' && (
          <>
            <span className="auth-card__eyebrow">Application review</span>
            <h2 id="portal-heading">Withdrawal requests</h2>
            <p>Review withdrawal requests from students and decide whether to approve them.</p>
            {status.error && <p className="auth-form__error" role="alert">{status.error}</p>}
            {isLoadingWithdrawals ? <p role="status">Loading withdrawal requests...</p>
              : withdrawalRequests.length === 0 ? <div className="portal-empty-state">No withdrawal requests are waiting for review.</div> : (
                <div className="cycle-list">
                  {withdrawalRequests.map((application) => {
                    const withdrawalKey = `${application.application_type}-${application.application_id}`
                    const cycle = semesters.find(({ id }) => Number(id) === Number(application.semester_applied_for))
                    const university = partnerUniversities.find(
                      ({ university_id }) => Number(university_id) === Number(application.university_id),
                    )
                    return (
                      <article className="cycle-list__item" key={withdrawalKey}>
                        <div className="cycle-list__heading">
                          <strong>{application.application_type === 'inbound' ? 'Inbound' : 'Outbound'} application #{application.application_id}</strong>
                          <span>{application.student?.name || 'Student name unavailable'}</span>
                        </div>
                        <details className="withdrawal-review-details">
                          <summary>Review request details</summary>
                          <dl>
                            <div><dt>Student email</dt><dd>{application.student?.student_email || 'Unavailable'}</dd></div>
                            <div><dt>Student ID</dt><dd>{application.student_id || 'Unavailable'}</dd></div>
                            <div><dt>Application status</dt><dd>{application.application_status}</dd></div>
                            <div><dt>Previous status</dt><dd>{application.withdrawal_previous_status || 'Unavailable'}</dd></div>
                            <div><dt>Exchange cycle</dt><dd>{cycle ? `${cycle.semester} ${cycle.academic_year}` : `Cycle #${application.semester_applied_for || 'Unavailable'}`}</dd></div>
                            <div><dt>Destination university</dt><dd>{university?.name || 'Unavailable'}</dd></div>
                            <div><dt>Submitted</dt><dd>{formatCycleDate(application.submitted_at)}</dd></div>
                            <div><dt>Withdrawal reason</dt><dd>{application.withdrawal_reason || 'No reason provided'}</dd></div>
                            <div><dt>Requested</dt><dd>{formatCycleDate(application.status_updated_at)}</dd></div>
                          </dl>
                          <div className="cycle-list__actions">
                            <button
                              className="btn btn--primary"
                              type="button"
                              onClick={() => reviewWithdrawal(application, true)}
                              disabled={reviewingWithdrawalKey !== null}
                            >
                              {reviewingWithdrawalKey === withdrawalKey ? 'Processing...' : 'Approve withdrawal'}
                            </button>
                            <button
                              className="btn btn--secondary"
                              type="button"
                              onClick={() => reviewWithdrawal(application, false)}
                              disabled={reviewingWithdrawalKey !== null}
                            >
                              Reject withdrawal
                            </button>
                          </div>
                        </details>
                      </article>
                    )
                  })}
                </div>
              )}
          </>
        )}
        {isKuCoordinator && activeView === 'applications' && <Suspense fallback={null}><CoordinatorApplications /></Suspense>}
        {!isKuCoordinator && activeView === 'progress' && (
          <section aria-labelledby="progress-heading">
            <span className="auth-card__eyebrow">Nomination tracking</span>
            <h2 id="progress-heading">Nominee application progress</h2>
            <p>Track application status for students you nominated.</p>
            <div className="progress-filter">
              <label htmlFor="progress-cycle">Exchange cycle</label>
              <select
                id="progress-cycle"
                value={progressCycle}
                onChange={(event) => setProgressCycle(event.target.value)}
              >
                <option value="all">All cycles</option>
                {cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.semester} {cycle.academic_year}
                  </option>
                ))}
              </select>
            </div>
            {(progressError || status.error) && (
              <p className="auth-form__error" role="alert">{progressError || status.error}</p>
            )}
            {isLoadingNominations || isLoadingProgress ? <p role="status">Loading nominee progress...</p>
              : visibleProgressNominations.length === 0 ? <p>No nominations found for this exchange cycle.</p> : (
                <div className="nomination-table-wrap">
                  <table className="nomination-table">
                    <thead>
                      <tr>
                        <th scope="col">Student</th>
                        <th scope="col">Email</th>
                        <th scope="col">Cycle</th>
                        <th scope="col">Nomination status</th>
                        <th scope="col">Application progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProgressNominations.map((nomination) => {
                        const cycle = cycles.find(({ id }) => Number(id) === Number(nomination.semester))
                        const applicationStatus = progressError
                          ? 'Unavailable'
                          : applicationStatuses[nomination.id] || 'Not started'
                        return (
                          <tr key={nomination.id}>
                            <th scope="row">{nomination.student_name}</th>
                            <td>{nomination.student_email}</td>
                            <td>{cycle ? `${cycle.semester} ${cycle.academic_year}` : `Cycle #${nomination.semester}`}</td>
                            <td>{nomination.nomination_status}</td>
                            <td>{applicationStatus}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </section>
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
        {isKuCoordinator && activeView === 'maintenance' && (
          <section className="maintenance-panel" aria-labelledby="maintenance-toggle-heading">
            <div className="maintenance-panel__header">
              <div>
                <span className="auth-card__eyebrow">Website status</span>
                <h2 id="maintenance-toggle-heading">Maintenance mode</h2>
              </div>
              <span className={maintenanceMode === null ? 'maintenance-panel__badge' : maintenanceMode ? 'maintenance-panel__badge maintenance-panel__badge--enabled' : 'maintenance-panel__badge maintenance-panel__badge--disabled'}>
                {maintenanceMode === null ? 'Unavailable' : maintenanceMode ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="maintenance-panel__copy">
              Current status: <strong>{maintenanceMode === null ? 'Unavailable' : maintenanceMode ? 'Enabled' : 'Disabled'}</strong>
            </p>
            <button className={maintenanceMode ? 'btn btn--secondary' : 'btn btn--primary'} type="button" onClick={handleMaintenanceToggle} disabled={maintenanceMode === null || isUpdatingMaintenance}>
              {isUpdatingMaintenance ? 'Updating status...' : maintenanceMode ? 'Disable maintenance mode' : 'Enable maintenance mode'}
            </button>
            {maintenanceMode === null && <button className="btn btn--secondary" type="button" onClick={onRetryMaintenanceStatus}>Retry status check</button>}
            {maintenanceError && <p className="auth-form__error" role="alert">{maintenanceError}</p>}
          </section>
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

function ProtectedPortal({ onSignOut, onDeleted, onRetryMaintenanceStatus, passwordOnly = false }) {
  const user = useAppStore((state) => state.session?.user)
  const profile = useAppStore((state) => state.profile)

  if (!user) return <Navigate to="/auth/signin" replace />
  if (passwordOnly && !profile) return <section className="portal-page"><div className="portal-card"><p role="status">Loading coordinator account...</p></div></section>
  if (passwordOnly && profile?.role !== 'coordinator') return <Navigate to="/portal" replace />

  if (profile?.role === 'coordinator') {
    const isKuCoordinator = isKuCoordinatorProfile(profile, user.email)
    if (!isKuCoordinator && profile.email_accepted !== true) {
      return <CoordinatorAccessPending user={user} onSignOut={onSignOut} onDeleted={onDeleted} />
    }
    if (passwordOnly) return <CoordinatorPasswordPage />
    return <CoordinatorPortal onDeleted={onDeleted} onSignOut={onSignOut} onRetryMaintenanceStatus={onRetryMaintenanceStatus} />
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
      if (result.error) setError(getDatabaseErrorMessage(result.error))
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
                  <Suspense fallback={<div className="partner-directory__map-shell" />}>
                    <PartnerUniversityMap
                      airports={partnerUniversityAirports}
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
                  </Suspense>
                </>
              )}
            </div>
          </section>
        </>
      )}
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
            <li><Link to="/blog" className="footer__link">Blog</Link></li>
          </ul>
        </div>
        <div className="footer__section">
          <h4 className="footer__heading">Legacy Documents</h4>
          <ul className="footer__links">
            <li><a href={`${import.meta.env.BASE_URL}docs/proposal.html`} className="footer__link">Proposal</a></li>
            <li>            <Link to="/erd" className="footer__link">Schema and ERD</Link></li>
            <li><Link to="/test-status" className="footer__link">Test and Status</Link></li>
            <li><Link to="/testing-mode" className="footer__link">Testing mode</Link></li>
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
        setError(getDatabaseErrorMessage(countryError))
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
  const { pathname } = useLocation()
  const isAscendHome = pathname === '/'
  const session = useAppStore((state) => state.session)
  const profile = useAppStore((state) => state.profile)
  const theme = useAppStore((state) => state.theme)
  const maintenanceMode = useAppStore((state) => state.maintenanceMode)
  const maintenanceStatusError = useAppStore((state) => state.maintenanceStatusError)
  const setSession = useAppStore((state) => state.setSession)
  const setProfile = useAppStore((state) => state.setProfile)
  const setMaintenanceMode = useAppStore((state) => state.setMaintenanceMode)
  const setMaintenanceStatusError = useAppStore((state) => state.setMaintenanceStatusError)
  const setTestingMode = useAppStore((state) => state.setTestingMode)
  const [sessionWarningSeconds, setSessionWarningSeconds] = useState(null)
  const [sessionTimeoutError, setSessionTimeoutError] = useState('')
  const [sessionEndedMessage, setSessionEndedMessage] = useState('')
  const resetInactivityTimer = useRef(null)

  const refreshMaintenanceStatus = useCallback(async () => {
    setMaintenanceStatusError('')
    const result = await readMaintenanceMode()
    setMaintenanceMode(result.mode)
    setMaintenanceStatusError(result.error)
  }, [setMaintenanceMode, setMaintenanceStatusError])

  useEffect(() => {
    let isCurrent = true
    readMaintenanceMode().then((result) => {
      if (!isCurrent) return
      setMaintenanceMode(result.mode)
      setMaintenanceStatusError(result.error)
    })
    return () => {
      isCurrent = false
    }
  }, [setMaintenanceMode, setMaintenanceStatusError])

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
  }, [setProfile, setSession])

  const signedInKuCoordinator = Boolean(
    session && profile && isKuCoordinatorProfile(profile, session.user.email),
  )

  useEffect(() => {
    if (!signedInKuCoordinator) return undefined

    const inactivityTimeout = 15 * 60 * 1000
    const warningDelay = inactivityTimeout - 60 * 1000
    let warningTimer
    let signOutTimer
    let countdownTimer
    let lastActivityAt = 0
    let isSigningOut = false

    const clearTimers = () => {
      window.clearTimeout(warningTimer)
      window.clearTimeout(signOutTimer)
      window.clearInterval(countdownTimer)
    }

    const signOutAfterInactivity = async () => {
      if (isSigningOut) return
      isSigningOut = true
      const { error } = await supabase.auth.signOut()
      isSigningOut = false
      if (error) {
        setSessionTimeoutError(getDatabaseErrorMessage(error))
        setSessionWarningSeconds(0)
        return
      }
      setSessionWarningSeconds(null)
      setSessionTimeoutError('')
      setSessionEndedMessage('Your session ended after 15 minutes of inactivity. Please sign in again.')
    }

    const startTimers = () => {
      clearTimers()
      setSessionTimeoutError('')
      setSessionWarningSeconds(null)
      warningTimer = window.setTimeout(() => {
        setSessionWarningSeconds(60)
        countdownTimer = window.setInterval(() => {
          setSessionWarningSeconds((seconds) => (
            seconds === null ? null : Math.max(0, seconds - 1)
          ))
        }, 1000)
      }, warningDelay)
      signOutTimer = window.setTimeout(signOutAfterInactivity, inactivityTimeout)
    }

    const handleActivity = () => {
      const now = Date.now()
      if (now - lastActivityAt < 1000) return
      lastActivityAt = now
      startTimers()
    }

    resetInactivityTimer.current = startTimers
    const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel']
    activityEvents.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }))
    startTimers()

    return () => {
      clearTimers()
      resetInactivityTimer.current = null
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, handleActivity))
    }
  }, [session?.user?.id, signedInKuCoordinator])

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) window.alert(error.message)
  }

  const handleDeleted = () => {
    window.location.hash = '/auth/signin'
  }

  // One gate for the whole website. Until the database confirms maintenance is off, nothing
  // of the site renders: visitors see the status loader, then the maintenance screen, on every
  // address. Coordinator sign-in stays reachable, and a signed-in KU coordinator gets through
  // because the portal is where maintenance is switched off.
  const siteOpen = maintenanceMode === false || signedInKuCoordinator
  if (!siteOpen && pathname !== '/auth/signin') {
    return maintenanceMode === null
      ? <StatusLoader theme={theme} error={maintenanceStatusError} onRetry={refreshMaintenanceStatus} />
      : <MaintenanceScreen theme={theme} />
  }

  return (
    <>
      {siteOpen && !isAscendHome && <SiteNavbar />}
      <main>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<AscendHome />} />
            <Route path="/auth/signup" element={maintenanceMode !== false ? <Navigate to="/auth/signin" replace /> : <AuthRoute mode="signup" />} />
            <Route path="/auth/signin" element={<AuthRoute mode="signin" coordinatorOnly={maintenanceMode !== false} sessionEndedMessage={sessionEndedMessage} onSessionNoticeDismiss={() => setSessionEndedMessage('')} />} />
            <Route path="/portal/password" element={session ? <ProtectedPortal passwordOnly onSignOut={handleSignOut} onDeleted={handleDeleted} onRetryMaintenanceStatus={refreshMaintenanceStatus} /> : <Navigate to="/auth/signin" replace />} />
            <Route path="/portal" element={session ? <ProtectedPortal onSignOut={handleSignOut} onDeleted={handleDeleted} onRetryMaintenanceStatus={refreshMaintenanceStatus} /> : <Navigate to="/auth/signin" replace />} />
            <Route path="/portal/inbound-application/*" element={session ? <InboundApplication /> : <Navigate to="/auth/signin" replace />} />
            <Route path="/portal/outbound-application/*" element={session ? <OutboundApplication /> : <Navigate to="/auth/signin" replace />} />
            <Route path="/partners" element={<PartnerUniversitiesRoute />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/erd" element={<ErdPage />} />
            <Route path="/test-status" element={<TestStatusPage />} />
            <Route path="/testing-mode" element={
              <TestingMode
                isKuCoordinator={signedInKuCoordinator}
                maintenanceMode={maintenanceMode}
                onTestingModeChanged={setTestingMode}
              />
            } />
          </Routes>
        </Suspense>
      </main>
      {signedInKuCoordinator && sessionWarningSeconds !== null && (
        <div className="inactivity-warning__backdrop">
          <section
            className="inactivity-warning"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="inactivity-warning-heading"
            aria-describedby="inactivity-warning-description"
          >
            <span className="auth-card__eyebrow">Session security</span>
            <h2 id="inactivity-warning-heading">Are you still there?</h2>
            <p id="inactivity-warning-description">
              You will be signed out in {Math.floor(sessionWarningSeconds / 60)}:
              {String(sessionWarningSeconds % 60).padStart(2, '0')} because of inactivity.
            </p>
            {sessionTimeoutError && <p className="auth-form__error" role="alert">{sessionTimeoutError}</p>}
            <div className="inactivity-warning__actions">
              <button
                className="btn btn--primary"
                type="button"
                autoFocus
                onClick={() => {
                  resetInactivityTimer.current?.()
                }}
              >
                Stay signed in
              </button>
            </div>
          </section>
        </div>
      )}
      {siteOpen && !isAscendHome && <Footer />}
    </>
  )
}

function AuthRoute({ mode, coordinatorOnly = false, sessionEndedMessage, onSessionNoticeDismiss }) {
  const navigate = useNavigate()
  const type = useAppStore((state) => state.authType)
  const setAuthType = useAppStore((state) => state.setAuthType)

  return (
    <AuthPage
      type={coordinatorOnly ? 'coordinator' : type}
      mode={mode}
      onTypeChange={setAuthType}
      onModeChange={(nextMode) => navigate(`/auth/${nextMode}`)}
      onAuthenticated={() => {
        onSessionNoticeDismiss?.()
        navigate('/portal')
      }}
      coordinatorOnly={coordinatorOnly}
      sessionEndedMessage={sessionEndedMessage}
    />
  )
}

export default App
