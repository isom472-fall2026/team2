import { useCallback, useState } from 'react'
import SuccessToast from './components/SuccessToast'

// The error line and success toast a portal view shows after an action. Each success gets a
// new toast key, so the same message shown twice in a row restarts the toast's timer.
export function useStatusToast() {
  const [status, setStatus] = useState({ error: '', message: '' })
  const [toastId, setToastId] = useState(0)
  const clearStatus = useCallback(() => setStatus({ error: '', message: '' }), [])
  const showError = useCallback((error) => setStatus({ error, message: '' }), [])
  const showSuccess = useCallback((message) => {
    setStatus({ error: '', message })
    setToastId((currentId) => currentId + 1)
  }, [])
  const dismissSuccess = useCallback(() => setStatus((current) => ({ ...current, message: '' })), [])
  const statusToast = status.message
    ? <SuccessToast key={toastId} message={status.message} onClose={dismissSuccess} />
    : null
  return { status, clearStatus, showError, showSuccess, statusToast }
}
