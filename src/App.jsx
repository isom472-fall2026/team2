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
        else {
          const rows = data || []
          const hasKuwaitUniversity = rows.some(({ name }) => name.toLowerCase() === 'kuwait university')
          setUniversities(hasKuwaitUniversity ? rows : [{ university_id: 'ku', name: 'Kuwait University' }, ...rows])
        }
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

    setIsSubmitting(true)
    const profileId = type === 'incoming'
      ? generateIncomingStudentId()
      : type === 'coordinator'
        ? generateCoordinatorId()
        : Number(form.studentId)
    const result = isSignUp
      ? await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            data: { name: form.name.trim(), student_id: profileId, user_type: type },
          },
        })
      : await supabase.auth.signInWithPassword({
          email: form.email.trim(),
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

      const selectedUniversity = universities.find(({ university_id }) => String(university_id) === form.university)
      if (type === 'coordinator' && selectedUniversity?.university_id === 'ku') {
        setError('Kuwait University must be present in PartnerUniversity before coordinator signup.')
        setIsSubmitting(false)
        return
      }
      const profile = type === 'coordinator'
        ? {
            coordinator_id: profileId,
            name: form.name.trim(),
            email: form.email.trim(),
            university: Number(form.university),
            user_id: result.data.user.id,
          }
        : {
            student_id: profileId,
            student_email: form.email.trim(),
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

function CoordinatorPortal({ profile }) {
  const [nominations, setNominations] = useState([])
  const [semesters, setSemesters] = useState([])
  const [form, setForm] = useState({ studentName: '', studentEmail: '', studentNationality: '', semester: '' })
  const [status, setStatus] = useState({ error: '', message: '' })

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
    supabase.from('exchange_cycle').select('id').order('id').then(({ data, error }) => {
      if (error) setStatus({ error: error.message, message: '' })
      else setSemesters(data || [])
    })
  }, [profile.coordinator_id])

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
    <div className="portal-dashboard">
      <section className="portal-card portal-card--wide">
        <span className="auth-card__eyebrow">Coordinator portal</span>
        <h1 id="portal-heading">Welcome, {profile.name}</h1>
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
      </section>
    </div>
  )
}

function ProtectedPortal({ user, profile, onSignOut }) {
  if (profile?.role === 'coordinator') return <CoordinatorPortal profile={profile} />

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
      </div>
    </section>
  )
}

function Navbar({ session, onSignOut }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="navbar__brand">
        <svg className="navbar__logo-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="navbar__brand-text">KU Exchange</span>
      </div>

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
            href="https://www.ku.edu.kw"
            target="_blank"
            rel="noopener noreferrer"
            className="navbar__link"
          >
            {/* University building icon */}
            <svg className="navbar__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 21h18M9 21V7l3-4 3 4v14M9 11h6M5 21V11l-2 2M19 21V11l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Kuwait University
          </a>
        </li>
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

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)

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

  return (
    <>
      <Navbar session={session} onSignOut={handleSignOut} />
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
            session ? <ProtectedPortal user={session.user} profile={profile} onSignOut={handleSignOut} /> : <Navigate to="/auth/signin" replace />
          } />
          <Route path="/portal/inbound-application" element={session ? <section className="portal-page"><div className="portal-card"><h1>Inbound application</h1><p>This application area is ready for the next portal feature.</p></div></section> : <Navigate to="/auth/signin" replace />} />
          <Route path="/portal/outbound-application" element={session ? <section className="portal-page"><div className="portal-card"><h1>Outbound application</h1><p>This application area is ready for the next portal feature.</p></div></section> : <Navigate to="/auth/signin" replace />} />
          <Route path="/erd" element={<ErdPage />} />
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
