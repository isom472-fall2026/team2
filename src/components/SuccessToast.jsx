import { useEffect } from 'react'

export default function SuccessToast({ message, onClose }) {
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
