import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { supabase } from '../supabase'
import { useAppStore } from '../stores/appStore'
import './CoordinatorAccount.css'

function CoordinatorAccountSettings({ profile }) {
  const session = useAppStore((state) => state.session)
  const setProfile = useAppStore((state) => state.setProfile)
  const [name, setName] = useState(profile.name || '')
  const [email, setEmail] = useState(profile.email || '')
  const [universityName, setUniversityName] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let isCurrent = true
    supabase
      .from('partneruniversity')
      .select('name')
      .eq('university_id', profile.university)
      .maybeSingle()
      .then(({ data }) => {
        if (isCurrent) setUniversityName(data?.name || 'Unknown university')
      })
    return () => { isCurrent = false }
  }, [profile.university])

  const saveAccount = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!name.trim()) {
      setError('Enter your name.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address.')
      return
    }

    const isKuCoordinator = Number(profile.university) === 4
    const emailIsKu = email.toLowerCase().endsWith('@ku.edu.kw')
    if (isKuCoordinator !== emailIsKu) {
      setError('Your email domain must match your coordinator university.')
      return
    }

    setIsSaving(true)
    const { data, error: saveError } = await supabase.rpc('update_my_coordinator_account', {
      requested_name: name,
      requested_email: email,
    })
    if (saveError) {
      setError(getDatabaseErrorMessage(saveError))
      setIsSaving(false)
      return
    }

    const savedProfile = Array.isArray(data) ? data[0] : data
    const currentEmail = session?.user?.email || profile.email
    let confirmationPending = false
    if (email !== currentEmail) {
      const { data: authData, error: authError } = await supabase.auth.updateUser({ email })
      if (authError) {
        await supabase.rpc('update_my_coordinator_account', {
          requested_name: name,
          requested_email: profile.email,
        })
        setError(getDatabaseErrorMessage(authError))
        setIsSaving(false)
        return
      }
      confirmationPending = authData.user?.email !== email
    }

    const updatedProfile = { ...profile, ...savedProfile, role: 'coordinator' }
    setProfile(updatedProfile)
    setName(updatedProfile.name)
    setEmail(updatedProfile.email)
    setMessage(confirmationPending
      ? 'Account details saved. Confirm your new email using the message sent to that address.'
      : 'Account details saved.')
    setIsSaving(false)
  }

  return (
    <section className="account-settings" aria-labelledby="account-settings-heading">
      <span className="auth-card__eyebrow">Coordinator account</span>
      <h2 id="account-settings-heading">My account</h2>
      <p>Update your contact details. Your university and coordinator access are unchanged.</p>
      <form className="account-settings__form" onSubmit={saveAccount}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          University
          <input value={universityName} readOnly />
        </label>
        {error && <p className="auth-form__error" role="alert">{error}</p>}
        {message && <p className="account-settings__message" role="status">{message}</p>}
        <div className="account-settings__actions">
          <button className="btn btn--primary" type="submit" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save changes'}
          </button>
          <Link className="btn btn--secondary" to="/portal/password">Change password</Link>
        </div>
      </form>
    </section>
  )
}

export function CoordinatorPasswordPage() {
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
    <section className="portal-page" aria-labelledby="password-heading">
      <div className="portal-card account-settings">
        <span className="auth-card__eyebrow">Account security</span>
        <h1 id="password-heading">Change password</h1>
        <form className="account-settings__form" onSubmit={changePassword}>
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
            <Link className="btn btn--secondary" to="/portal">Back to portal</Link>
          </div>
        </form>
      </div>
    </section>
  )
}

export default CoordinatorAccountSettings