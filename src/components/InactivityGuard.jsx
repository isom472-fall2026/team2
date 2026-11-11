import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'

const inactivityTimeout = 15 * 60 * 1000
const warningDelay = inactivityTimeout - 60 * 1000

// Signs a KU coordinator out after 15 minutes without activity, warning them for the last
// minute. It keeps the countdown in its own state: held in App, the once-a-second countdown
// re-rendered every page of the site.
export default function InactivityGuard({ onSessionEnded }) {
  const [warningSeconds, setWarningSeconds] = useState(null)
  const [timeoutError, setTimeoutError] = useState('')
  const resetTimers = useRef(null)

  useEffect(() => {
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
        setTimeoutError(getDatabaseErrorMessage(error))
        setWarningSeconds(0)
        return
      }
      setWarningSeconds(null)
      setTimeoutError('')
      onSessionEnded('Your session ended after 15 minutes of inactivity. Please sign in again.')
    }

    const startTimers = () => {
      clearTimers()
      setTimeoutError('')
      setWarningSeconds(null)
      warningTimer = window.setTimeout(() => {
        setWarningSeconds(60)
        countdownTimer = window.setInterval(() => {
          setWarningSeconds((seconds) => (
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

    resetTimers.current = startTimers
    const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel']
    activityEvents.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }))
    startTimers()

    return () => {
      clearTimers()
      resetTimers.current = null
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, handleActivity))
    }
  }, [onSessionEnded])

  if (warningSeconds === null) return null

  return (
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
          You will be signed out in {Math.floor(warningSeconds / 60)}:
          {String(warningSeconds % 60).padStart(2, '0')} because of inactivity.
        </p>
        {timeoutError && <p className="auth-form__error" role="alert">{timeoutError}</p>}
        <div className="inactivity-warning__actions">
          <button
            className="btn btn--primary"
            type="button"
            autoFocus
            onClick={() => {
              resetTimers.current?.()
            }}
          >
            Stay signed in
          </button>
        </div>
      </section>
    </div>
  )
}
