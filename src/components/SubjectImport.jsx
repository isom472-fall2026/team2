import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { COURSE_CREDITS } from '../courseCredits'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { supabase } from '../supabase'
import SubjectFilters from './SubjectFilters'
import './SubjectImport.css'

const FROM_APP = 'ku-exchange-app'
const FROM_EXTENSION = 'cba-syllabus-importer'
const SYLLABUS_BUCKET = 'syllabi'
// The extension answers a ping at once, so silence after this long means it is not installed.
const EXTENSION_CHECK_MS = 1500
const CHROME_WEB_STORE = 'https://chrome.google.com/webstore/detail/ffcmglhjadnmbbfaieflgjcdbkalmgja'
// The CBA site publishes syllabi as PDF and as Word files; these are the types the bucket accepts.
const SYLLABUS_EXTENSIONS = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

const idleImport = { state: 'idle', message: '', saved: 0, total: 0, lastSaved: '' }

const loadingCopy = {
  opening: {
    title: 'Opening the CBA site',
    text: 'A new tab is opening on the CBA syllabus site. Switch to it to sign in.',
  },
  'signing-in': {
    title: 'Waiting for you to sign in',
    text: 'Sign in with your KU Microsoft account in the CBA tab. The import starts by itself.',
  },
  importing: {
    title: 'Importing CBA subjects',
    text: 'The extension is reading each subject and its syllabus. Keep both tabs open.',
  },
}

function postToExtension(message) {
  window.postMessage({ source: FROM_APP, ...message }, window.location.origin)
}

function base64ToBlob(data, type) {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type })
}

async function saveSubject(subject, file) {
  let syllabusPath = null
  if (file) {
    const extension = SYLLABUS_EXTENSIONS[file.type]
    if (!extension) {
      throw new Error(`The syllabus for ${subject.course_display_code} is a ${file.type || 'file of unknown type'}, not a PDF or Word file.`)
    }
    syllabusPath = `${subject.course_code}.${extension}`
    const { error } = await supabase.storage
      .from(SYLLABUS_BUCKET)
      .upload(syllabusPath, base64ToBlob(file.data, file.type), { contentType: file.type, upsert: true })
    if (error) throw new Error(`Could not store the syllabus for ${subject.course_display_code}: ${error.message}`)
  }

  const { error } = await supabase
    .from('subjects')
    .upsert({ ...subject, course_syllabus: syllabusPath }, { onConflict: 'course_code' })
  if (error) throw new Error(`Could not save ${subject.course_display_code}: ${getDatabaseErrorMessage(error)}`)
}

function ImportLoadingScreen({ importStatus }) {
  const copy = loadingCopy[importStatus.state]
  const hasProgress = importStatus.state === 'importing' && importStatus.total > 0
  const percent = hasProgress ? Math.round((importStatus.saved / importStatus.total) * 100) : 0

  // Rendered into <body> so it covers the whole portal, not only the workspace card.
  return createPortal(
    <div className="subject-import-loading" role="dialog" aria-modal="true" aria-labelledby="subject-import-loading-title">
      <div className="subject-import-loading__card">
        <div className="subject-import-loading__orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h2 id="subject-import-loading-title">{copy.title}</h2>
        <p>{copy.text}</p>
        <div
          className={hasProgress ? 'subject-import-loading__bar' : 'subject-import-loading__bar subject-import-loading__bar--indeterminate'}
          role="progressbar"
          aria-label="Import progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={hasProgress ? percent : undefined}
        >
          <span style={hasProgress ? { width: `${percent}%` } : undefined} />
        </div>
        <p className="subject-import-loading__count" aria-live="polite">
          {hasProgress
            ? `${importStatus.saved} of ${importStatus.total} saved (${percent}%)${importStatus.lastSaved ? ` · ${importStatus.lastSaved}` : ''}`
            : 'This screen updates by itself.'}
        </p>
      </div>
    </div>,
    document.body,
  )
}

const extensionStatusCopy = {
  checking: 'Checking for the importer extension...',
  ready: 'Importer extension installed',
  missing: 'Importer extension not installed',
}

function ExtensionStatus({ state, version, onCheckAgain }) {
  return (
    <div className={`subject-import__extension subject-import__extension--${state}`} role="status">
      <span className="subject-import__extension-dot" aria-hidden="true" />
      <div className="subject-import__extension-copy">
        <strong>
          {extensionStatusCopy[state]}
          {state === 'ready' && version ? ` (version ${version})` : ''}
        </strong>
        {state === 'missing' && (
          <span>
            Install it from the{' '}
            <a className="subject-import__link" href={CHROME_WEB_STORE} target="_blank" rel="noreferrer">Chrome Web Store</a>
            {' '}to enable the import, then reload this page.
          </span>
        )}
      </div>
      {state === 'missing' && (
        <button className="btn btn--secondary" type="button" onClick={onCheckAgain}>Check again</button>
      )}
    </div>
  )
}

function SubjectImport() {
  const [extensionState, setExtensionState] = useState('checking')
  const [extensionVersion, setExtensionVersion] = useState('')
  const extensionCheckTimer = useRef(null)
  const [importStatus, setImportStatus] = useState(idleImport)
  const [subjects, setSubjects] = useState([])
  const [subjectsError, setSubjectsError] = useState('')
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(true)
  const [downloadError, setDownloadError] = useState('')

  const loadSubjects = useCallback(async () => {
    const { data, error } = await supabase
      .from('subjects')
      .select('course_code, course_display_code, course_name, course_department, course_syllabus')
      .order('course_department')
      .order('course_display_code')
    setSubjectsError(error ? getDatabaseErrorMessage(error) : '')
    setSubjects(data ?? [])
    setIsLoadingSubjects(false)
  }, [])

  useEffect(() => {
    loadSubjects()
  }, [loadSubjects])

  // A check keeps the current state until it has an answer, so re-checking an installed
  // extension does not flicker the import button off and on.
  const checkExtension = useCallback(() => {
    clearTimeout(extensionCheckTimer.current)
    postToExtension({ type: 'ping' })
    extensionCheckTimer.current = setTimeout(() => {
      extensionCheckTimer.current = null
      setExtensionState('missing')
    }, EXTENSION_CHECK_MS)
  }, [])

  useEffect(() => {
    checkExtension()
    // Coming back to this tab is when a coordinator has just installed or removed the extension.
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') checkExtension()
    }
    window.addEventListener('focus', checkExtension)
    document.addEventListener('visibilitychange', checkWhenVisible)
    return () => {
      window.removeEventListener('focus', checkExtension)
      document.removeEventListener('visibilitychange', checkWhenVisible)
      clearTimeout(extensionCheckTimer.current)
    }
  }, [checkExtension])

  useEffect(() => {
    const reply = (requestId, ok, error) => postToExtension({ type: 'reply', requestId, ok, error })

    async function handleMessage(event) {
      if (event.source !== window || event.origin !== window.location.origin) return
      const message = event.data
      if (!message || message.source !== FROM_EXTENSION) return

      if (message.type === 'ready') {
        clearTimeout(extensionCheckTimer.current)
        extensionCheckTimer.current = null
        setExtensionState('ready')
        setExtensionVersion(message.version ?? '')
      } else if (message.type === 'status') {
        setImportStatus((current) => ({
          ...current,
          state: message.state,
          message: message.message,
          total: message.total ?? current.total,
        }))
      } else if (message.type === 'subject') {
        try {
          await saveSubject(message.subject, message.file)
          setImportStatus((current) => ({
            ...current,
            saved: current.saved + 1,
            lastSaved: message.subject.course_display_code,
          }))
          reply(message.requestId, true)
        } catch (error) {
          setImportStatus((current) => ({ ...current, state: 'error', message: error.message }))
          reply(message.requestId, false, error.message)
        }
      } else if (message.type === 'finished') {
        const skippedNote = message.skipped?.length
          ? ` Skipped ${message.skipped.length} CBA entries without a valid course number: ${message.skipped.join(', ')}.`
          : ''
        setImportStatus((current) => ({
          ...current,
          state: 'done',
          message: `Imported ${message.saved} subjects and their syllabi.${skippedNote}`,
        }))
        reply(message.requestId, true)
        loadSubjects()
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [loadSubjects])

  const startImport = () => {
    setImportStatus({ ...idleImport, state: 'opening', message: 'Opening the CBA syllabus site...' })
    postToExtension({ type: 'start-import' })
  }

  const downloadSyllabus = async (subject) => {
    setDownloadError('')
    const { data, error } = await supabase.storage.from(SYLLABUS_BUCKET).createSignedUrl(subject.course_syllabus, 60)
    if (error) {
      setDownloadError(`Could not open the syllabus for ${subject.course_display_code}: ${error.message}`)
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const isRunning = Object.hasOwn(loadingCopy, importStatus.state)

  return (
    <section className="subject-import" aria-labelledby="subject-import-heading">
      <span className="auth-card__eyebrow">College of Business Administration</span>
      <h2 id="subject-import-heading">CBA subjects and syllabi</h2>
      <p>
        Import every CBA subject and its current syllabus from the CBA syllabus site. The import runs in a new
        browser tab where you sign in with your KU Microsoft account. Keep this page open until it finishes.
      </p>

      <ExtensionStatus
        state={extensionState}
        version={extensionVersion}
        onCheckAgain={() => {
          setExtensionState('checking')
          checkExtension()
        }}
      />

      <button
        className="btn btn--primary"
        type="button"
        onClick={startImport}
        disabled={extensionState !== 'ready' || isRunning}
        title={extensionState === 'ready' ? undefined : 'Install the importer extension to enable the import.'}
      >
        {isRunning ? 'Import running...' : 'Import subjects from the CBA site'}
      </button>

      {isRunning && <ImportLoadingScreen importStatus={importStatus} />}
      {(importStatus.state === 'done' || importStatus.state === 'error') && (
        <div
          className={importStatus.state === 'error' ? 'subject-import__status subject-import__status--error' : 'subject-import__status'}
          role={importStatus.state === 'error' ? 'alert' : 'status'}
        >
          <p>{importStatus.message}</p>
          {importStatus.state === 'error' && <p>The CBA tab stays open so you can see what happened.</p>}
        </div>
      )}

      <h3 className="subject-import__subheading">Saved subjects ({subjects.length})</h3>
      {subjectsError && <p className="auth-form__error" role="alert">{subjectsError}</p>}
      {downloadError && <p className="auth-form__error" role="alert">{downloadError}</p>}
      {isLoadingSubjects ? (
        <p>Loading subjects...</p>
      ) : subjects.length === 0 ? (
        <p>No subjects have been imported yet.</p>
      ) : (
        <SubjectFilters subjects={subjects}>
          {(matches) => (
            <div className="subject-import__table-wrap">
              <table className="subject-import__table">
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Course</th>
                    <th scope="col">Department</th>
                    <th scope="col">Credits</th>
                    <th scope="col">Syllabus</th>
                  </tr>
                </thead>
                <tbody lang="en" dir="ltr">
                  {matches.map((subject) => (
                    <tr key={subject.course_code}>
                      <td>
                        <Link className="subject-import__link" to={`/portal/subjects/${subject.course_code}`}>
                          {subject.course_display_code}
                        </Link>
                      </td>
                      <td>
                        <Link className="subject-import__link" to={`/portal/subjects/${subject.course_code}`}>
                          {subject.course_name}
                        </Link>
                      </td>
                      <td>{subject.course_department}</td>
                      <td>{COURSE_CREDITS}</td>
                      <td>
                        {subject.course_syllabus ? (
                          <button className="subject-import__download" type="button" onClick={() => downloadSyllabus(subject)}>
                            Download
                          </button>
                        ) : 'Syllabus not available'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SubjectFilters>
      )}
    </section>
  )
}

export default SubjectImport
