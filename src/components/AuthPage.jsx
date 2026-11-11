import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SuccessToast from './SuccessToast'
import AnimatedHeight from './AnimatedHeight'
import { FadeText, TypedText } from './AnimatedText'
import ExchangeRoutesBackground from './ExchangeRoutesBackground'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { isKuCoordinatorProfile } from '../coordinatorProfile'
import { useAppStore } from '../stores/appStore'

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

const userTypeIcons = {
  ku: (
    <>
      <path d="M2 9.5 12 5l10 4.5L12 14z" />
      <path d="M6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5" />
      <path d="M22 9.5V15" />
    </>
  ),
  incoming: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z" />
    </>
  ),
  coordinator: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M3 12.5h18" />
    </>
  ),
}

let measureContext = null

// A pulse on the field and a spark where the new character landed. Alternating between two
// identical animations restarts them on every keystroke without forcing a reflow.
function animateKeystroke(event, spark) {
  const field = event.target
  field.dataset.keystroke = field.dataset.keystroke === 'a' ? 'b' : 'a'
  if (!spark || field.tagName !== 'INPUT' || !event.nativeEvent.inputType?.startsWith('insert')) return

  const style = getComputedStyle(field)
  measureContext ??= document.createElement('canvas').getContext('2d')
  measureContext.font = style.font
  // Email fields have no selection API (null), and typing there is almost always at the end.
  const caret = field.selectionStart ?? field.value.length
  const typed = field.type === 'password' ? '•'.repeat(caret) : field.value.slice(0, caret)
  const contentLeft = parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
  const contentRight = parseFloat(style.borderLeftWidth) + field.clientWidth - parseFloat(style.paddingRight)
  const x = Math.min(contentRight, contentLeft + measureContext.measureText(typed).width - field.scrollLeft)
  const fieldBox = field.getBoundingClientRect()
  const formBox = field.form.getBoundingClientRect()
  spark.style.setProperty('--spark-x', `${fieldBox.left - formBox.left + Math.max(contentLeft, x)}px`)
  spark.style.setProperty('--spark-y', `${fieldBox.top - formBox.top + fieldBox.height / 2}px`)
  spark.dataset.keystroke = field.dataset.keystroke
}

function generateIncomingStudentId() {
  const randomValues = new Uint32Array(1)
  crypto.getRandomValues(randomValues)
  return 100000000 + (randomValues[0] % 900000000)
}

function generateCoordinatorId() {
  return generateIncomingStudentId()
}

function AuthPage({ type, mode, onTypeChange, onModeChange, onAuthenticated, coordinatorOnly = false, sessionEndedMessage = '' }) {
  const options = authOptions[type]
  const isSignUp = mode === 'signup'
  const testingMode = useAppStore((state) => state.testingMode)
  const setTestingMode = useAppStore((state) => state.setTestingMode)
  const setAuthVerificationPending = useAppStore((state) => state.setAuthVerificationPending)
  const setSession = useAppStore((state) => state.setSession)
  const setProfile = useAppStore((state) => state.setProfile)
  const [form, setForm] = useState({ email: '', password: '', name: '', studentId: '', university: '' })
  const sparkRef = useRef(null)
  const [universities, setUniversities] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [toastId, setToastId] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [accessRequested, setAccessRequested] = useState(false)
  const dismissSuccess = useCallback(() => setMessage(''), [])

  useEffect(() => {
    if (coordinatorOnly || type !== 'coordinator') return

    supabase
      .from('partneruniversity')
      .select('university_id, name')
      .eq('available', true)
      .order('name')
      .then(({ data, error: universityError }) => {
        if (universityError) setError(getDatabaseErrorMessage(universityError))
        setUniversities(data || [])
      })
  }, [coordinatorOnly, type])

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
    if (!isSignUp) {
      setProfile(null)
      setSession(null)
      setAuthVerificationPending(true)
    }
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
      setError(isSignUp ? result.error.message : 'Unable to sign in with those credentials.')
      setAuthVerificationPending(false)
      setIsSubmitting(false)
      return
    }

    let verifiedProfile
    if (!isSignUp) {
      const { data: profile, error: profileError } = await supabase
        .from(options.table)
        .select('*')
        .eq('user_id', result.data.user.id)
        .maybeSingle()
      const validProfile = !profileError && profile
        && (!coordinatorOnly || isKuCoordinatorProfile(profile, email))

      if (!validProfile) {
        const { error: signOutError } = await supabase.auth.signOut()
        setError('Unable to sign in with those credentials.')
        if (!signOutError) setAuthVerificationPending(false)
        setIsSubmitting(false)
        return
      }
      verifiedProfile = { ...profile, role: type }
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

      verifiedProfile = { ...profile, role: type }
    }

    onAuthenticated(
      result.data.session,
      verifiedProfile,
    )
    setIsSubmitting(false)
  }

  if (accessRequested) {
    return (
      <section className="auth-page" aria-labelledby="access-requested-heading">
        <AnimatedHeight className="auth-card">
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
        </AnimatedHeight>
      </section>
    )
  }

  return (
    <section className="auth-page" aria-labelledby="auth-heading">
      <AnimatedHeight className="auth-card">
        <span className="auth-card__eyebrow"><FadeText text={coordinatorOnly ? 'KU Coordinator' : options.label} /></span>
        <h1 id="auth-heading">
          <TypedText text={coordinatorOnly ? 'Sign in as a KU coordinator' : isSignUp ? `Create your ${options.label} account` : `Sign in to the ${options.label} portal`} />
        </h1>
        <p className="auth-card__description">
          <FadeText text={coordinatorOnly ? 'Sign in to disable maintenance mode and restore public access.' : options.description} />
        </p>
        {sessionEndedMessage && <p className="session-ended-message" role="status">{sessionEndedMessage}</p>}
        {!coordinatorOnly && (
          <fieldset className="auth-type-choice" data-selected={type}>
            <legend>I am a</legend>
            <div className="auth-type-choice__options" style={{ '--choice-index': Object.keys(authOptions).indexOf(type) }}>
              <span className="auth-type-choice__indicator" aria-hidden="true" />
              {Object.entries(authOptions).map(([userType, userOptions]) => (
                <label key={userType} className="auth-type-choice__option">
                  <input
                    type="radio"
                    name="userType"
                    value={userType}
                    checked={type === userType}
                    onChange={() => {
                      setError('')
                      setMessage('')
                      onTypeChange(userType)
                    }}
                  />
                  <svg className="auth-type-choice__icon" viewBox="0 0 24 24" aria-hidden="true">{userTypeIcons[userType]}</svg>
                  <span>{userOptions.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {type === 'coordinator' && (
          <p className="auth-warning auth-reveal" role="alert">
            {coordinatorOnly
              ? 'Only authorized KU coordinators may sign in while maintenance mode is enabled.'
              : 'only for partner university coordinators, attempts at misuse by students will be caught and legally prosecuted'}
          </p>
        )}
        <form className="auth-form" onSubmit={handleSubmit} onInput={(event) => animateKeystroke(event, sparkRef.current)}>
          {isSignUp && (
            <>
              <label className="auth-reveal" htmlFor="name">Full name</label>
              <input className="auth-reveal" id="name" name="name" value={form.name} onChange={updateField} required autoComplete="name" />
              {type === 'ku' && (
                <>
                  <label className="auth-reveal" htmlFor="studentId">Student ID</label>
                  <input className="auth-reveal" id="studentId" name="studentId" value={form.studentId} onChange={updateField} required inputMode="numeric" />
                </>
              )}
              {type === 'coordinator' && (
                <>
                  <label className="auth-reveal" htmlFor="university">University</label>
                  <select className="auth-reveal" id="university" name="university" value={form.university} onChange={updateField} required>
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
            <FadeText text={isSubmitting ? 'Working...' : isSignUp && type === 'coordinator' && Number(form.university) !== 4 ? 'Request access' : isSignUp ? 'Create account' : 'Sign in'} />
          </button>
          <span ref={sparkRef} className="auth-form__spark" aria-hidden="true" />
        </form>
        {!coordinatorOnly && (
          <button className="auth-card__switch" type="button" onClick={() => onModeChange(isSignUp ? 'signin' : 'signup')}>
            <FadeText text={isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'} />
          </button>
        )}
      </AnimatedHeight>
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

export default function AuthRoute({ mode, coordinatorOnly = false, sessionEndedMessage, onSessionNoticeDismiss }) {
  const navigate = useNavigate()
  const type = useAppStore((state) => state.authType)
  const setAuthType = useAppStore((state) => state.setAuthType)
  const setSession = useAppStore((state) => state.setSession)
  const setProfile = useAppStore((state) => state.setProfile)
  const setAuthVerificationPending = useAppStore((state) => state.setAuthVerificationPending)

  return (
    <div className="auth-scene">
      <ExchangeRoutesBackground />
      <AuthPage
        type={coordinatorOnly ? 'coordinator' : type}
        mode={mode}
        onTypeChange={setAuthType}
        onModeChange={(nextMode) => navigate(`/auth/${nextMode}`)}
        onAuthenticated={(session, profile) => {
          setSession(session)
          if (profile) setProfile(profile)
          setAuthVerificationPending(false)
          onSessionNoticeDismiss?.()
          navigate('/portal')
        }}
        coordinatorOnly={coordinatorOnly}
        sessionEndedMessage={sessionEndedMessage}
      />
    </div>
  )
}
