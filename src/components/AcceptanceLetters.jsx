import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { formatUpdateTime } from '../formatUpdateTime'
import { acceptanceLetterFileName, buildAcceptanceLetterPdf, getAcceptanceLetterFields, letterTypes } from '../acceptanceLetter'
import ReplacementFileField from './ReplacementFileField'
import './AcceptanceLetters.css'

const bucket = 'acceptance-letters'

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function downloadStoredLetter(path, fileName) {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error) throw error
  saveBlob(data, fileName)
}

function storedExtension(path) {
  return String(path).split('.').pop()?.toLowerCase() || 'pdf'
}

function stampedFileName(application, letter) {
  return acceptanceLetterFileName(application, letter.letter_type).replace(/\.pdf$/, `-stamped.${storedExtension(letter.stamped_file_path)}`)
}

function letterFolder(application, letterType) {
  return `${application.student_id}/${application.application_id}/${letterType.toLowerCase()}`
}

async function readLetters(applicationId) {
  const { data, error } = await supabase
    .from('acceptance_letters')
    .select('*')
    .eq('application_id', applicationId)
  if (error) throw error
  return data || []
}

function LetterCard({ application, letterType, letter, lookups, coordinator, onChanged, onStudentNotified }) {
  const [preview, setPreview] = useState(null)
  const [stampedFile, setStampedFile] = useState(null)
  const [fileFieldKey, setFileFieldKey] = useState(0)
  const [state, setState] = useState({ busy: false, error: '', message: '' })
  const label = letterType.toLowerCase()

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url)
  }, [preview])

  const generate = async () => {
    setState({ busy: true, error: '', message: '' })
    const { fields, missing } = getAcceptanceLetterFields({ application, letterType, coordinator, ...lookups })
    if (missing.length) {
      setState({ busy: false, error: `The letter cannot be generated until the application has: ${missing.join(', ')}.`, message: '' })
      return
    }
    try {
      const blob = await buildAcceptanceLetterPdf(fields)
      setPreview({ blob, url: URL.createObjectURL(blob) })
      setState({ busy: false, error: '', message: '' })
    } catch (error) {
      setState({ busy: false, error: error.message || 'The letter could not be generated.', message: '' })
    }
  }

  const issue = async () => {
    setState({ busy: true, error: '', message: '' })
    const path = `${letterFolder(application, letterType)}/${crypto.randomUUID()}-issued.pdf`
    let uploaded = false
    try {
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, preview.blob, { contentType: 'application/pdf', upsert: false })
      if (uploadError) throw uploadError
      uploaded = true
      const { error } = await supabase.rpc('issue_acceptance_letter', {
        requested_application_id: application.application_id,
        requested_letter_type: letterType,
        requested_file_path: path,
      })
      if (error) throw error
      saveBlob(preview.blob, acceptanceLetterFileName(application, letterType))
      setPreview(null)
      setState({ busy: false, error: '', message: `The ${label} letter was issued and downloaded. Sign and stamp it, then upload the stamped copy to send it to the student.` })
      onChanged()
    } catch (error) {
      if (uploaded) await supabase.storage.from(bucket).remove([path])
      setState({ busy: false, error: getDatabaseErrorMessage(error), message: '' })
    }
  }

  const sendStamped = async (event) => {
    event.preventDefault()
    if (!stampedFile || state.busy) return
    setState({ busy: true, error: '', message: '' })
    const safeName = stampedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
    const path = `${letterFolder(application, letterType)}/${crypto.randomUUID()}-stamped-${safeName}`
    let uploaded = false
    try {
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, stampedFile, { contentType: stampedFile.type, upsert: false })
      if (uploadError) throw uploadError
      uploaded = true
      const { error } = await supabase.rpc('save_stamped_acceptance_letter', {
        requested_letter_id: letter.id,
        requested_file_path: path,
      })
      if (error) throw error
      setStampedFile(null)
      setFileFieldKey((key) => key + 1)
      setState({ busy: false, error: '', message: `The stamped ${label} letter was saved, and the student was sent an update.` })
      onChanged()
      onStudentNotified?.()
    } catch (error) {
      if (uploaded) await supabase.storage.from(bucket).remove([path])
      setState({ busy: false, error: getDatabaseErrorMessage(error), message: '' })
    }
  }

  const download = async (path, fileName) => {
    setState({ busy: true, error: '', message: '' })
    try {
      await downloadStoredLetter(path, fileName)
      setState({ busy: false, error: '', message: '' })
    } catch (error) {
      setState({ busy: false, error: getDatabaseErrorMessage(error), message: '' })
    }
  }

  return (
    <article className="acceptance-letter" aria-labelledby={`acceptance-letter-${label}`}>
      <h3 id={`acceptance-letter-${label}`}>{letterType} acceptance letter</h3>
      {!letter && !preview && (
        <>
          <p>Generate the letter to review it before it is issued.</p>
          <button className="btn btn--primary" type="button" onClick={generate} disabled={state.busy}>
            {state.busy ? 'Generating…' : `Generate ${label} letter`}
          </button>
        </>
      )}
      {!letter && preview && (
        <>
          <p>Review the letter. Issuing it records today’s date and your name, and downloads the PDF for signing and stamping. The student does not receive it until the stamped copy is uploaded.</p>
          <iframe className="acceptance-letter__preview" src={preview.url} title={`${letterType} acceptance letter preview`} />
          <div className="nomination-table__actions">
            <button className="btn btn--primary" type="button" onClick={issue} disabled={state.busy}>
              {state.busy ? 'Issuing…' : `Issue and download ${label} letter`}
            </button>
            <button className="btn btn--secondary" type="button" onClick={() => setPreview(null)} disabled={state.busy}>Cancel</button>
          </div>
        </>
      )}
      {letter && (
        <>
          <dl className="acceptance-letter__record">
            <div><dt>Issued</dt><dd>{formatUpdateTime(letter.issued_at)} by {letter.issued_by_name} ({letter.issued_by_email})</dd></div>
            <div>
              <dt>Stamped copy</dt>
              <dd>{letter.stamped_at
                ? `Sent to the student ${formatUpdateTime(letter.stamped_at)} by ${letter.stamped_by_name} (${letter.stamped_by_email})`
                : 'Not uploaded yet — the student has not received this letter'}</dd>
            </div>
          </dl>
          <div className="nomination-table__actions">
            <button className="btn btn--secondary" type="button" disabled={state.busy}
              onClick={() => download(letter.file_path, acceptanceLetterFileName(application, letterType))}>
              Download issued letter
            </button>
            {letter.stamped_file_path && (
              <button className="btn btn--secondary" type="button" disabled={state.busy}
                onClick={() => download(letter.stamped_file_path, stampedFileName(application, letter))}>
                Download stamped letter
              </button>
            )}
          </div>
          {!letter.stamped_file_path && (
            <form className="acceptance-letter__stamped" onSubmit={sendStamped}>
              <ReplacementFileField key={fileFieldKey} label="Stamped letter (PDF, JPEG or PNG)" field={`stamped_${label}_letter`} currentPath="" onChange={(_field, file) => setStampedFile(file)} disabled={state.busy} />
              <button className="btn btn--primary" disabled={!stampedFile || state.busy}>
                {state.busy ? 'Sending…' : 'Upload stamped letter and send to student'}
              </button>
            </form>
          )}
        </>
      )}
      {state.error && <p className="auth-form__error" role="alert">{state.error}</p>}
      {state.message && <p className="coordinator-review__message" role="status">{state.message}</p>}
    </article>
  )
}

export default function AcceptanceLetters({ application, lookups, onStudentNotified }) {
  const [letters, setLetters] = useState([])
  const [coordinator, setCoordinator] = useState(null)
  const [load, setLoad] = useState({ loading: true, error: '' })
  const applicationId = application.application_id

  const refresh = useCallback(async () => {
    try {
      setLetters(await readLetters(applicationId))
      setLoad({ loading: false, error: '' })
    } catch (error) {
      setLoad({ loading: false, error: getDatabaseErrorMessage(error) })
    }
  }, [applicationId])

  useEffect(() => {
    let isCurrent = true
    const loadPanel = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const [rows, coordinatorResult] = await Promise.all([
          readLetters(applicationId),
          supabase.from('coordinator').select('coordinator_id, name, email').eq('user_id', user?.id).maybeSingle(),
        ])
        if (coordinatorResult.error) throw coordinatorResult.error
        if (!isCurrent) return
        setLetters(rows)
        setCoordinator(coordinatorResult.data)
        setLoad({ loading: false, error: '' })
      } catch (error) {
        if (isCurrent) setLoad({ loading: false, error: getDatabaseErrorMessage(error) })
      }
    }
    loadPanel()
    return () => {
      isCurrent = false
    }
  }, [applicationId])

  const isApproved = ['Accepted', 'Approved'].includes(application.application_status)
  // A letter matches the approval it states, so only the current approval type can be issued;
  // a conditional letter issued before an upgrade stays listed beside the unconditional one.
  const shownTypes = letterTypes.filter((type) =>
    letters.some(({ letter_type }) => letter_type === type) || (isApproved && application.approval_type === type))

  return (
    <section className="coordinator-review__panel" aria-labelledby="acceptance-letters-heading">
      <h2 id="acceptance-letters-heading">Acceptance letters</h2>
      {load.loading && <p role="status">Loading acceptance letters...</p>}
      {load.error && <p className="auth-form__error" role="alert">{load.error}</p>}
      {!load.loading && !load.error && shownTypes.length === 0 && (
        <p>An acceptance letter can be issued once the application has conditional or unconditional approval.</p>
      )}
      {!load.loading && !load.error && shownTypes.map((type) => (
        <LetterCard
          key={type}
          application={application}
          letterType={type}
          letter={letters.find(({ letter_type }) => letter_type === type)}
          lookups={lookups}
          coordinator={coordinator}
          onChanged={refresh}
          onStudentNotified={onStudentNotified}
        />
      ))}
    </section>
  )
}

export function StudentAcceptanceLetters({ application }) {
  const [letters, setLetters] = useState([])
  const [error, setError] = useState('')
  const applicationId = application.application_id

  useEffect(() => {
    let isCurrent = true
    readLetters(applicationId)
      .then((rows) => {
        if (isCurrent) setLetters(rows.filter(({ stamped_file_path }) => stamped_file_path))
      })
      .catch((readError) => {
        if (isCurrent) setError(getDatabaseErrorMessage(readError))
      })
    return () => {
      isCurrent = false
    }
  }, [applicationId])

  const download = async (letter) => {
    try {
      setError('')
      await downloadStoredLetter(letter.stamped_file_path, stampedFileName(application, letter))
    } catch (downloadError) {
      setError(getDatabaseErrorMessage(downloadError))
    }
  }

  if (!letters.length && !error) return null
  return (
    <section className="coordinator-review__panel" aria-labelledby="student-acceptance-letters-heading">
      <h2 id="student-acceptance-letters-heading">Acceptance letters</h2>
      {letters.map((letter) => (
        <p key={letter.id}>
          <button className="btn btn--primary" type="button" onClick={() => download(letter)}>
            Download {letter.letter_type.toLowerCase()} acceptance letter
          </button>
          {' '}Issued {formatUpdateTime(letter.stamped_at)}
        </p>
      ))}
      {error && <p className="auth-form__error" role="alert">{error}</p>}
    </section>
  )
}
