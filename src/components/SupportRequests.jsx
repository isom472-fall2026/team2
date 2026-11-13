import { useEffect, useState } from 'react'
import SupportRequestCard from './SupportRequestCard'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  MESSAGE_LIMIT,
  OPEN_REQUEST_LIMIT,
  SUBJECT_LIMIT,
  SUPPORT_CATEGORIES,
  characterCount,
  removeSupportAttachments,
  supportReference,
  uploadSupportAttachments,
} from '../supportRequests'
import './SupportRequests.css'

const emptyForm = { category: '', subject: '', message: '' }

function fileKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function fileSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Blank means nothing but spaces. The text itself is never trimmed: it is saved as typed.
function findProblems(form, files) {
  const problems = {}
  if (!form.category) problems.category = 'Choose a category.'
  if (!form.subject.trim()) problems.subject = 'Write a subject.'
  const length = characterCount(form.message)
  if (!form.message.trim()) problems.message = 'Write a message.'
  else if (length > MESSAGE_LIMIT) problems.message = `Your message is ${length} characters. The limit is ${MESSAGE_LIMIT}.`
  if (files.length > MAX_ATTACHMENTS) problems.files = `Attach at most ${MAX_ATTACHMENTS} files.`
  else if (files.some((file) => !ATTACHMENT_TYPES.includes(file.type))) problems.files = 'Attachments must be PDF, JPG or PNG files.'
  else if (files.some((file) => file.size > MAX_ATTACHMENT_BYTES)) problems.files = 'Each attachment must be 10 MB or smaller.'
  return problems
}

export default function SupportRequests({ profile }) {
  const [form, setForm] = useState(emptyForm)
  const [files, setFiles] = useState([])
  const [problems, setProblems] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sentReference, setSentReference] = useState('')
  const [requests, setRequests] = useState({ loading: true, rows: [], error: '' })
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let isCurrent = true
    // Row Level Security returns only the signed-in student's own requests.
    supabase
      .from('support_request')
      .select('id, category, subject, message, attachments, status, reply, replied_at, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!isCurrent) return
        setRequests(error
          ? { loading: false, rows: [], error: getDatabaseErrorMessage(error) }
          : { loading: false, rows: data || [], error: '' })
      })
    return () => {
      isCurrent = false
    }
  }, [reloadCount])

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  // Each pick adds to the list instead of replacing it, so files can come from different
  // folders. The input is cleared afterwards so a removed file can be picked again.
  const addFiles = (event) => {
    const picked = [...event.target.files]
    event.target.value = ''
    setFiles((current) => {
      const known = new Set(current.map(fileKey))
      return [...current, ...picked.filter((file) => !known.has(fileKey(file)))]
    })
  }

  const removeFile = (file) => {
    setFiles((current) => current.filter((other) => other !== file))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (atOpenLimit) return
    setSentReference('')
    setSubmitError('')
    const found = findProblems(form, files)
    setProblems(found)
    if (Object.keys(found).length > 0) return

    setIsSubmitting(true)
    let paths = []
    try {
      paths = await uploadSupportAttachments(profile.student_id, files)
      const { data, error } = await supabase
        .from('support_request')
        .insert({ student_id: profile.student_id, ...form, attachments: paths })
        .select('id')
        .single()
      if (error) throw error
      setSentReference(supportReference(data.id))
      setForm(emptyForm)
      setFiles([])
      setReloadCount((count) => count + 1)
    } catch (error) {
      // Nothing was saved, so the uploaded files would otherwise be left without a request.
      await removeSupportAttachments(paths)
      setSubmitError(error.code ? getDatabaseErrorMessage(error) : error.message || 'Your request could not be sent.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const messageLength = characterCount(form.message)
  // The database enforces this too; checking here explains it before the student fills the form in.
  const atOpenLimit = requests.rows.filter((request) => request.status === 'Open').length >= OPEN_REQUEST_LIMIT
  const hasProblems = Object.keys(problems).length > 0

  return (
    <>
      <span className="auth-card__eyebrow">Support</span>
      <h2>Contact the office</h2>
      <p>Send a question to the Student Exchange Office. The answer appears here and in your inbox.</p>

      {sentReference && (
        <div className="support-confirmation" role="status">
          <strong>Your request was sent.</strong>
          <span>Reference number: <b>{sentReference}</b></span>
        </div>
      )}

      {atOpenLimit && (
        <p className="support-limit" role="status">
          You have {OPEN_REQUEST_LIMIT} requests waiting for an answer. You can send another once one of them is answered.
        </p>
      )}

      <form className="support-form" onSubmit={handleSubmit} noValidate>
        {hasProblems && (
          <p className="auth-form__error" role="alert">Your request was not sent. Fix the highlighted fields and try again.</p>
        )}

        <label htmlFor="support-category">Category</label>
        <select id="support-category" name="category" value={form.category} onChange={updateField} aria-invalid={Boolean(problems.category)} aria-describedby={problems.category ? 'support-category-error' : undefined}>
          <option value="">Choose a category</option>
          {SUPPORT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        {problems.category && <p className="auth-form__error" id="support-category-error">{problems.category}</p>}

        <label htmlFor="support-subject">Subject</label>
        <input id="support-subject" name="subject" value={form.subject} onChange={updateField} maxLength={SUBJECT_LIMIT} aria-invalid={Boolean(problems.subject)} aria-describedby={problems.subject ? 'support-subject-error' : undefined} />
        {problems.subject && <p className="auth-form__error" id="support-subject-error">{problems.subject}</p>}

        <label htmlFor="support-message">Message</label>
        {/* No maxLength here: a message over the limit must be reported, not silently cut. */}
        <textarea id="support-message" name="message" rows="6" value={form.message} onChange={updateField} aria-invalid={Boolean(problems.message)} aria-describedby={problems.message ? 'support-message-count support-message-error' : 'support-message-count'} />
        <span className={messageLength > MESSAGE_LIMIT ? 'support-form__count support-form__count--over' : 'support-form__count'} id="support-message-count">
          {messageLength} / {MESSAGE_LIMIT} characters
        </span>
        {problems.message && <p className="auth-form__error" id="support-message-error">{problems.message}</p>}

        <label htmlFor="support-files">Attachments (optional)</label>
        <input id="support-files" type="file" multiple accept={ATTACHMENT_TYPES.join(',')} onChange={addFiles} aria-invalid={Boolean(problems.files)} aria-describedby={problems.files ? 'support-files-hint support-files-error' : 'support-files-hint'} />
        <span className="support-form__count" id="support-files-hint">Up to {MAX_ATTACHMENTS} files. PDF, JPG or PNG, 10 MB each. Choose again to add more.</span>
        {files.length > 0 && (
          <ul className="support-form__files" aria-label="Files to attach">
            {files.map((file) => (
              <li key={fileKey(file)}>
                <span>{file.name} <small>({fileSize(file.size)})</small></span>
                <button type="button" onClick={() => removeFile(file)} aria-label={`Remove ${file.name}`}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        {problems.files && <p className="auth-form__error" id="support-files-error">{problems.files}</p>}

        {submitError && <p className="auth-form__error" role="alert">{submitError}</p>}
        <button className="btn btn--primary" type="submit" disabled={isSubmitting || atOpenLimit}>
          {isSubmitting ? 'Sending...' : 'Send request'}
        </button>
      </form>

      <h2 className="portal-section-heading">Your requests</h2>
      {requests.loading ? <p role="status">Loading your requests...</p>
        : requests.error ? <p className="auth-form__error" role="alert">{requests.error}</p>
          : requests.rows.length === 0 ? <div className="portal-empty-state">You have not sent any requests yet.</div>
            : (
              <ul className="support-request-list">
                {requests.rows.map((request) => <SupportRequestCard key={request.id} request={request} />)}
              </ul>
            )}
    </>
  )
}
