import { useState, useEffect } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import ErdPage from './ErdPage'
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

function AuthPage({ type, mode, onTypeChange, onModeChange, onAuthenticated }) {
  const options = authOptions[type]
  const isSignUp = mode === 'signup'
  const [form, setForm] = useState({ email: '', password: '', name: '', studentId: '', university: '' })
  const [universities, setUniversities] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (type !== 'coordinator') return

    supabase
      .from('partneruniversity')
      .select('university_id, name')
      .eq('available', true)
      .order('name')
      .then(({ data, error: universityError }) => {
        if (universityError) setError(universityError.message)
        const rows = data || []
        const hasKuwaitUniversity = rows.some(({ name }) => name.toLowerCase() === 'kuwait university')
        setUniversities(hasKuwaitUniversity ? rows : [{ university_id: 'ku', name: 'Kuwait University' }, ...rows])
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
    const requiresKuEmail = type === 'ku' || (type === 'coordinator' && form.university === 'ku')
    if (isSignUp && requiresKuEmail && !email.endsWith('@ku.edu.kw')) {
      setError('KU students and Kuwait University coordinators must use an email ending with @ku.edu.kw.')
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
            university: form.university === 'ku' ? null : Number(form.university),
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
        setIsSubmitting(false)
        return
      }
    }

    onAuthenticated(result.data.session)
    setIsSubmitting(false)
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
          {message && <p className="auth-form__message" role="status">{message}</p>}
          <button className="btn btn--primary btn--full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Working...' : isSignUp ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <button className="auth-card__switch" type="button" onClick={() => onModeChange(isSignUp ? 'signin' : 'signup')}>
          {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
        </button>
      </div>
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

function CycleForm({ form, setForm, onSubmit, isSubmitting, status }) {
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
      <button className="btn btn--primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Starting cycle...' : 'Start exchange cycle'}
      </button>
    </form>
  )
}

function CoordinatorPortal({ profile, onDeleted }) {
  const [nominations, setNominations] = useState([])
  const [semesters, setSemesters] = useState([])
  const [form, setForm] = useState({ studentName: '', studentEmail: '', studentNationality: '', semester: '' })
  const [cycleForm, setCycleForm] = useState(emptyCycleForm)
  const [cycles, setCycles] = useState([])
  const [activeView, setActiveView] = useState('manage')
  const [isStartingCycle, setIsStartingCycle] = useState(false)
  const [status, setStatus] = useState({ error: '', message: '' })

  const loadCycles = async () => {
    const { data, error } = await supabase
      .from('exchange_cycle')
      .select('id, semester, academic_year, nominations_o, nominations_c, application_o, application_c, cycle_start, cycle_end')
      .order('id', { ascending: false })
    if (error) setStatus({ error: error.message, message: '' })
    else setCycles(data || [])
  }

  useEffect(() => {
    supabase
      .from('studentnominations')
      .select('id, student_name, student_email, student_nationality, created_at, semester')
      .eq('coordinator_id', profile.coordinator_id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setStatus({ error: error.message, message: '' })
        else setNominations(data || [])
      })
    supabase
      .from('exchange_cycle')
      .select('id, semester, academic_year, nominations_o, nominations_c, application_o, application_c, cycle_start, cycle_end')
      .order('id', { ascending: false })
      .then(({ data, error }) => {
        if (error) setStatus({ error: error.message, message: '' })
        else setCycles(data || [])
      })
    supabase.from('exchange_cycle').select('id').order('id').then(({ data, error }) => {
      if (error) setStatus({ error: error.message, message: '' })
      else setSemesters(data || [])
    })
  }, [profile.coordinator_id])

  const startExchangeCycle = async (event) => {
    event.preventDefault()
    setStatus({ error: '', message: '' })
    const dates = [
      ['nominations', cycleForm.nominationsOpen, cycleForm.nominationsClose],
      ['applications', cycleForm.applicationOpen, cycleForm.applicationClose],
      ['exchange cycle', cycleForm.cycleStart, cycleForm.cycleEnd],
    ]
    if (dates.some(([, open, close]) => new Date(open) >= new Date(close))) {
      setStatus({ error: 'Each opening or start date must be before its closing or end date.', message: '' })
      return
    }
    setIsStartingCycle(true)
    const { error } = await supabase.from('exchange_cycle').insert({
      semester: cycleForm.semester,
      academic_year: cycleForm.academicYear,
      nominations_o: new Date(cycleForm.nominationsOpen).toISOString(),
      nominations_c: new Date(cycleForm.nominationsClose).toISOString(),
      application_o: new Date(cycleForm.applicationOpen).toISOString(),
      application_c: new Date(cycleForm.applicationClose).toISOString(),
      cycle_start: new Date(cycleForm.cycleStart).toISOString(),
      cycle_end: new Date(cycleForm.cycleEnd).toISOString(),
    })
    if (error) {
      setStatus({ error: error.message, message: '' })
    } else {
      setCycleForm(emptyCycleForm)
      await loadCycles()
      setStatus({ error: '', message: 'Exchange cycle started.' })
      setActiveView('manage')
    }
    setIsStartingCycle(false)
  }

  const submitNomination = async (event) => {
    event.preventDefault()
    setStatus({ error: '', message: '' })
    const { error } = await supabase.from('studentnominations').insert({
      coordinator_id: profile.coordinator_id,
      student_name: form.studentName.trim(),
      student_email: form.studentEmail.trim(),
      student_nationality: form.studentNationality.trim(),
      semester: Number(form.semester),
    })
    if (error) {
      setStatus({ error: error.message, message: '' })
      return
    }
    setForm({ studentName: '', studentEmail: '', studentNationality: '', semester: '' })
    setStatus({ error: '', message: 'Student nomination submitted.' })
    const { data: updatedNominations, error: refreshError } = await supabase
      .from('studentnominations')
      .select('id, student_name, student_email, student_nationality, created_at, semester')
      .eq('coordinator_id', profile.coordinator_id)
      .order('created_at', { ascending: false })
    if (refreshError) {
      setStatus({ error: refreshError.message, message: '' })
      return
    }
    setNominations(updatedNominations || [])
  }

  return (
    <div className="portal-dashboard portal-dashboard--coordinator">
      <aside className="portal-sidebar" aria-label="Coordinator portal navigation">
        <span className="portal-sidebar__eyebrow">Coordinator portal</span>
        <h1 className="portal-sidebar__title">KU Exchange</h1>
        <p className="portal-sidebar__welcome">Welcome, {profile.name}</p>
        <nav className="portal-sidebar__nav">
          <button className={activeView === 'start' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('start')}>
            <span aria-hidden="true">＋</span> Start exchange cycle
          </button>
          <button className={activeView === 'manage' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('manage')}>
            <span aria-hidden="true">▦</span> Manage exchange cycle
          </button>
          <button className={activeView === 'nominations' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('nominations')}>
            <span aria-hidden="true">◌</span> Student nominations
          </button>
        </nav>
        <div className="portal-sidebar__footer">
          <span className="portal-sidebar__secure">Signed in securely</span>
        </div>
      </aside>
      <section className="portal-card portal-card--wide portal-card--workspace">
        {activeView === 'start' && (
          <>
            <span className="auth-card__eyebrow">New cycle</span>
            <h2 id="portal-heading">Start an exchange cycle</h2>
            <p>Set the timetable for inbound nominations and exchange applications.</p>
            <CycleForm form={cycleForm} setForm={setCycleForm} onSubmit={startExchangeCycle} isSubmitting={isStartingCycle} status={status} />
          </>
        )}
        {activeView === 'manage' && (
          <>
            <span className="auth-card__eyebrow">Cycle dashboard</span>
            <h2 id="portal-heading">Manage exchange cycles</h2>
            <p>Review the schedules currently available to students and coordinators.</p>
            {status.message && <p className="auth-form__message" role="status">{status.message}</p>}
            {status.error && <p className="auth-form__error" role="alert">{status.error}</p>}
            {cycles.length === 0 ? <div className="portal-empty-state">No exchange cycles have been started yet.</div> : (
              <ul className="cycle-list">
                {cycles.map((cycle) => (
                  <li key={cycle.id} className="cycle-list__item">
                    <div><strong>{cycle.semester} {cycle.academic_year}</strong><span>Cycle #{cycle.id}</span></div>
                    <dl>
                      <div><dt>Nominations</dt><dd>{formatCycleDate(cycle.nominations_o)} – {formatCycleDate(cycle.nominations_c)}</dd></div>
                      <div><dt>Applications</dt><dd>{formatCycleDate(cycle.application_o)} – {formatCycleDate(cycle.application_c)}</dd></div>
                      <div><dt>Exchange cycle</dt><dd>{formatCycleDate(cycle.cycle_start)} – {formatCycleDate(cycle.cycle_end)}</dd></div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {activeView === 'nominations' && (
          <>
            <span className="auth-card__eyebrow">Student nominations</span>
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
            {semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.id}</option>)}
          </select>
          {status.error && <p className="auth-form__error" role="alert">{status.error}</p>}
          {status.message && <p className="auth-form__message" role="status">{status.message}</p>}
          <button className="btn btn--primary" type="submit">Submit nomination</button>
        </form>
        <h2 className="portal-section-heading">Submitted nominations</h2>
        {nominations.length === 0 ? <p>No nominations submitted yet.</p> : (
          <ul className="nomination-list">
            {nominations.map((nomination) => (
              <li key={nomination.id}>
                <strong>{nomination.student_name}</strong> · {nomination.student_email} · {nomination.student_nationality}
              </li>
            ))}
          </ul>
        )}
          </>
        )}
        <AccountDeleteButton onDeleted={onDeleted} />
      </section>
    </div>
  )
}

function ProtectedPortal({ user, profile, onSignOut, onDeleted }) {
  if (profile?.role === 'coordinator') return <CoordinatorPortal profile={profile} onDeleted={onDeleted} />

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

function Navbar({ session, onSignOut, theme, onThemeChange }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <nav className="navbar" aria-label="Main navigation">
      <a href="https://www.ku.edu.kw" target="_blank" rel="noopener noreferrer" className="navbar__brand" aria-label="KU Exchange at Kuwait University">
        <span className="navbar__brand-text">KU Exchange</span>
        <span className="navbar__university-logo" aria-hidden="true">
          <img src={`${import.meta.env.BASE_URL}images/kulogolightmode.png`} alt="" className="navbar__university-logo--light" />
          <img src={`${import.meta.env.BASE_URL}images/kulogodarkmode.png`} alt="" className="navbar__university-logo--dark" />
        </span>
      </a>

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
          <a
            href="#partner-universities"
            className="navbar__link"
          >
            {/* Handshake / partnership icon */}
            <svg className="navbar__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M16 8l-4-4-4 4M12 4v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 13l-3 3a2 2 0 0 0 2.83 2.83L11 15.66M16 13l3 3a2 2 0 0 1-2.83 2.83L13 15.66M11 15.66l1 1 1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Partner Universities
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

const infoCards = [
  {
    id: 'eligibility',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    title: 'Eligibility',
    body: 'Open to undergraduate and postgraduate students who have completed at least one academic year at Kuwait University with a minimum CGPA of 2.5.',
  },
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
