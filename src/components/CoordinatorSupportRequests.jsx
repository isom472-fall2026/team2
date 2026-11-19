import { useEffect, useState } from 'react'
import SupportRequestCard from './SupportRequestCard'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { supportReference } from '../supportRequests'
import { useStatusToast } from '../useStatusToast'
import './SupportRequests.css'

// Requests still waiting for an answer come first; within each group the newest is on top.
function openFirst(first, second) {
  if (first.status !== second.status) return first.status === 'Open' ? -1 : 1
  return second.created_at.localeCompare(first.created_at)
}

export default function CoordinatorSupportRequests() {
  const [state, setState] = useState({ loading: true, rows: [], error: '' })
  const [drafts, setDrafts] = useState({})
  const [replyErrors, setReplyErrors] = useState({})
  const [sendingId, setSendingId] = useState(null)
  const { showSuccess, statusToast } = useStatusToast()

  useEffect(() => {
    let isCurrent = true
    supabase
      .from('support_request')
      .select('id, category, subject, message, attachments, status, reply, replied_at, created_at, student:incomingstudentauth(name, student_email)')
      .then(({ data, error }) => {
        if (!isCurrent) return
        setState(error
          ? { loading: false, rows: [], error: getDatabaseErrorMessage(error) }
          : { loading: false, rows: data || [], error: '' })
      })
    return () => {
      isCurrent = false
    }
  }, [])

  const sendReply = async (event, request) => {
    event.preventDefault()
    const reply = drafts[request.id] || ''
    if (!reply.trim()) {
      setReplyErrors((current) => ({ ...current, [request.id]: 'Write a reply before marking the request Answered.' }))
      return
    }
    setReplyErrors((current) => ({ ...current, [request.id]: '' }))
    setSendingId(request.id)
    // One database function saves the reply, marks the request Answered and adds the update to
    // the student's inbox, so the three cannot get out of step.
    const { data, error } = await supabase.rpc('answer_support_request', {
      requested_request_id: request.id,
      reply_text: reply,
    })
    setSendingId(null)
    if (error) {
      setReplyErrors((current) => ({ ...current, [request.id]: error.code === 'P0001' ? error.message : getDatabaseErrorMessage(error) }))
      return
    }
    setState((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === request.id ? { ...row, ...data } : row)),
    }))
    showSuccess(`Reply sent for ${supportReference(request.id)}.`)
  }

  const openCount = state.rows.filter((row) => row.status === 'Open').length

  return (
    <>
      <span className="auth-card__eyebrow">Student support</span>
      <h2 id="portal-heading">Support requests</h2>
      <p>Questions incoming students sent to the office. Sending a reply marks the request Answered and adds it to the student&apos;s inbox.</p>
      {state.loading ? <p role="status">Loading support requests...</p>
        : state.error ? <p className="auth-form__error" role="alert">{state.error}</p>
          : state.rows.length === 0 ? <div className="portal-empty-state">No support requests have been sent yet.</div>
            : (
              <>
                <p className="support-request-count" role="status">{openCount} open · {state.rows.length - openCount} answered</p>
                <ul className="support-request-list">
                  {[...state.rows].sort(openFirst).map((request) => (
                    <SupportRequestCard key={request.id} request={request} student={request.student}>
                      {request.status === 'Open' && (
                        <form className="support-form support-form--reply" onSubmit={(event) => sendReply(event, request)} noValidate>
                          <label htmlFor={`support-reply-${request.id}`}>Reply to {supportReference(request.id)}</label>
                          <textarea
                            id={`support-reply-${request.id}`}
                            rows="4"
                            value={drafts[request.id] || ''}
                            onChange={(event) => setDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
                            aria-invalid={Boolean(replyErrors[request.id])}
                          />
                          {replyErrors[request.id] && <p className="auth-form__error" role="alert">{replyErrors[request.id]}</p>}
                          <button className="btn btn--primary" type="submit" disabled={sendingId === request.id}>
                            {sendingId === request.id ? 'Sending...' : 'Send reply and mark Answered'}
                          </button>
                        </form>
                      )}
                    </SupportRequestCard>
                  ))}
                </ul>
              </>
            )}
      {statusToast}
    </>
  )
}
