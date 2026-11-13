import { useState } from 'react'
import { formatUpdateTime } from '../formatUpdateTime'
import { attachmentName, openSupportAttachment, supportReference } from '../supportRequests'
import './SupportRequests.css'

// One support request as both the student and the KU coordinator see it. The coordinator's view
// passes the student's details and, while the request is open, a reply form as children.
export default function SupportRequestCard({ request, student, children }) {
  const [fileError, setFileError] = useState('')

  const openFile = async (path) => {
    setFileError('')
    try {
      await openSupportAttachment(path)
    } catch (error) {
      setFileError(error.message || 'The file could not be opened.')
    }
  }

  return (
    <li className="support-request">
      <div className="support-request__heading">
        <div>
          <span className="support-request__reference">{supportReference(request.id)}</span>
          <h3>{request.subject}</h3>
        </div>
        <span className={`support-request__status support-request__status--${request.status.toLowerCase()}`}>
          {request.status}
        </span>
      </div>
      <p className="support-request__meta">
        {student && <>{student.name} · {student.student_email} · </>}
        {request.category} · Sent <time dateTime={request.created_at}>{formatUpdateTime(request.created_at)}</time>
      </p>
      <p className="support-request__text">{request.message}</p>
      {request.attachments.length > 0 && (
        <ul className="support-request__files" aria-label="Attached files">
          {request.attachments.map((path) => (
            <li key={path}>
              <button type="button" onClick={() => openFile(path)}>{attachmentName(path)}</button>
            </li>
          ))}
        </ul>
      )}
      {fileError && <p className="auth-form__error" role="alert">{fileError}</p>}
      {request.reply && (
        <div className="support-request__reply">
          <strong>Reply from the Student Exchange Office</strong>
          <time dateTime={request.replied_at}>{formatUpdateTime(request.replied_at)}</time>
          <p className="support-request__text">{request.reply}</p>
        </div>
      )}
      {children}
    </li>
  )
}
