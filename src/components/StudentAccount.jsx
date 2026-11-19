import { useEffect, useState } from 'react'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { supabase } from '../supabase'
import { useAppStore } from '../stores/appStore'
import './CoordinatorAccount.css'
import './StudentAccount.css'

// The update functions raise these with wording written for the student.
const STUDENT_FACING_ERRORS = /^(A user with|A KU email|A valid email|A student ID|Name is required|Your student ID)/

function accountErrorMessage(error) {
  if (typeof error?.message === 'string' && STUDENT_FACING_ERRORS.test(error.message)) return `${error.message}.`
  return getDatabaseErrorMessage(error)
}

function detailsFrom(profile) {
  return {
    name: profile.name ?? '',
    email: profile.student_email ?? '',
    studentId: profile.student_id ? String(profile.student_id) : '',
  }
}

function saveStudentDetails(isKuStudent, details) {
  return isKuStudent
    ? supabase.rpc('update_my_ku_student_account', {
        requested_name: details.name,
        requested_email: details.email,
        requested_student_id: Number(details.studentId),
      })
    : supabase.rpc('update_my_incoming_student_account', {
        requested_name: details.name,
        requested_email: details.email,
      })
}

function StudentPassword() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const changePassword = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (password.length < 6) {
      setError('Your password must contain at least 6 characters.')
      return
    }
    if (password !== confirmation) {
      setError('The password confirmation does not match.')
      return
    }

    setIsSaving(true)
    const { error: passwordError } = await supabase.auth.updateUser({ password })
    setIsSaving(false)
    if (passwordError) {
      setError(passwordError.message)
      return
    }
    setPassword('')
    setConfirmation('')
    setMessage('Your password has been changed.')
  }

  return (
    <form className="account-settings__form student-account__section" onSubmit={changePassword} aria-labelledby="student-password-heading">
      <h3 id="student-password-heading">Change password</h3>
      <label>
        New password
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete="new-password" />
      </label>
      <label>
        Confirm new password
        <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={6} autoComplete="new-password" />
      </label>
      {error && <p className="auth-form__error" role="alert">{error}</p>}
      {message && <p className="account-settings__message" role="status">{message}</p>}
      <div className="account-settings__actions">
        <button className="btn btn--primary" type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Update password'}
        </button>
      </div>
    </form>
  )
}

function StudentAccount({ profile }) {
  const session = useAppStore((state) => state.session)
  const setProfile = useAppStore((state) => state.setProfile)
  const isKuStudent = profile.role === 'ku'
  const [details, setDetails] = useState(() => detailsFrom(profile))
  const [isBlankPromptOpen, setIsBlankPromptOpen] = useState(false)
  const [hasOutboundApplication, setHasOutboundApplication] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isKuStudent) return undefined
    let isCurrent = true
    supabase
      .from('outboundapplication')
      .select('application_id', { count: 'exact', head: true })
      .eq('student_id', profile.student_id)
      .then(({ count }) => {
        if (isCurrent) setHasOutboundApplication((count ?? 0) > 0)
      })
    return () => { isCurrent = false }
  }, [isKuStudent, profile.student_id])

  const updateField = (event) => {
    const { name, value } = event.target
    setDetails((current) => ({ ...current, [name]: value }))
    setError('')
    setMessage('')
  }

  const cancelChanges = () => {
    setDetails(detailsFrom(profile))
    setIsBlankPromptOpen(false)
    setError('')
  }

  const saveDetails = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const next = { name: details.name.trim(), email: details.email.trim(), studentId: details.studentId.trim() }
    if (!next.name || !next.email || (isKuStudent && !next.studentId)) {
      setIsBlankPromptOpen(true)
      return
    }
    setIsBlankPromptOpen(false)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) {
      setError('Enter a valid email address.')
      return
    }
    if (isKuStudent && !/@ku\.edu\.kw$/i.test(next.email)) {
      setError('Use your KU email address ending in @ku.edu.kw.')
      return
    }
    if (isKuStudent && !/^\d+$/.test(next.studentId)) {
      setError('Your student ID must contain digits only.')
      return
    }

    setIsSaving(true)
    const { data, error: saveError } = await saveStudentDetails(isKuStudent, next)
    if (saveError) {
      setError(accountErrorMessage(saveError))
      setIsSaving(false)
      return
    }
    const saved = Array.isArray(data) ? data[0] : data

    const signInEmail = session?.user?.email ?? profile.student_email
    let confirmationPending = false
    if (next.email.toLowerCase() !== signInEmail?.toLowerCase()) {
      const { data: authData, error: authError } = await supabase.auth.updateUser({ email: next.email })
      if (authError) {
        // Sign-in still uses the old email, so the profile goes back to the details it matches.
        await saveStudentDetails(isKuStudent, detailsFrom(profile))
        setError(getDatabaseErrorMessage(authError))
        setIsSaving(false)
        return
      }
      confirmationPending = authData.user?.email?.toLowerCase() !== next.email.toLowerCase()
    }

    setProfile({ ...profile, ...saved, role: profile.role })
    setDetails(detailsFrom(saved))
    setMessage(confirmationPending
      ? 'Your details have been saved. Confirm your new email using the message sent to that address.'
      : 'Your details have been saved.')
    setIsSaving(false)
  }

  return (
    <section className="account-settings" aria-labelledby="student-account-heading">
      <span className="auth-card__eyebrow">{isKuStudent ? 'KU student account' : 'Incoming student account'}</span>
      <h2 id="student-account-heading">My account</h2>
      <p>Check and update the details the exchange office uses to contact you.</p>

      {/* noValidate: an empty field opens the cancel-or-fill prompt instead of the browser's tooltip. */}
      <form className="account-settings__form" onSubmit={saveDetails} noValidate>
        <label>
          Name
          <input name="name" value={details.name} onChange={updateField} autoComplete="name" />
        </label>
        <label>
          Email
          <input name="email" type="email" value={details.email} onChange={updateField} autoComplete="email" />
        </label>
        {isKuStudent && (
          <label>
            Student ID
            <input
              name="studentId"
              value={details.studentId}
              onChange={updateField}
              inputMode="numeric"
              readOnly={hasOutboundApplication}
              aria-describedby={hasOutboundApplication ? 'student-id-locked' : undefined}
            />
            {hasOutboundApplication && (
              <span className="student-account__hint" id="student-id-locked">
                Your student ID cannot be changed after you start an outbound application. Contact the KU exchange coordinator.
              </span>
            )}
          </label>
        )}

        {isBlankPromptOpen && (
          <div className="student-account__prompt" role="alert">
            <p>Every field needs a value. Enter your details, or cancel to keep the ones already saved.</p>
            <button className="btn btn--secondary" type="button" onClick={cancelChanges}>Cancel changes</button>
          </div>
        )}
        {error && <p className="auth-form__error" role="alert">{error}</p>}
        {message && <p className="account-settings__message" role="status">{message}</p>}
        <div className="account-settings__actions">
          <button className="btn btn--primary" type="submit" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>

      <StudentPassword />
    </section>
  )
}

export default StudentAccount
