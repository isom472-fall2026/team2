import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { useAppStore } from '../stores/appStore'
import './OutboundApplication.css'

const storageBucket = 'inbound-application-files'

const steps = [
  { path: 'personal-information', title: 'Personal information', description: 'Tell us who you are and how to contact you.' },
  { path: 'academic-information', title: 'Academic information', description: 'Share your current academic standing.' },
  { path: 'exchange-documents', title: 'Exchange and documents', description: 'Review your nomination and attach required documents.' },
  { path: 'terms-and-conditions', title: 'Terms and conditions', description: 'Review and confirm each statement before submitting.' },
]

const terms = [
  'I confirm that the information and documents in this application are accurate and complete.',
  'I authorize Kuwait University to verify the information and documents provided for this application.',
  'I understand that submitting this application does not guarantee admission.',
  'I will comply with applicable laws, visa and immigration requirements, and Kuwait University rules.',
]

const emptyForm = {
  first_name: '',
  last_name: '',
  middle_name: '',
  gender: '',
  birthdate: '',
  profile_photo: '',
  country_of_residence: '',
  passport_number: '',
  passport_expiry_date: '',
  passport_copy: '',
  max_gpa: '',
  gpa: '',
  expected_graduation_date: '',
  credits_passed: '',
  max_credits: '',
  email: '',
  phone_number: '',
  phone_country_code: '',
  is_whatsapp_available: false,
  major: '',
  transcript: '',
  language_proficiency: '',
  current_year_of_study: '',
  nationality: '',
  passport_issuing_country: '',
  semester_applied_for: '',
}

const requiredAcademicFields = [
  'major',
  'current_year_of_study',
  'gpa',
  'max_gpa',
  'credits_passed',
  'max_credits',
  'expected_graduation_date',
]

const phoneCountryCodes = [
  ['Afghanistan', '+93'], ['Albania', '+355'], ['Algeria', '+213'], ['Argentina', '+54'],
  ['Australia', '+61'], ['Austria', '+43'], ['Bahrain', '+973'], ['Bangladesh', '+880'],
  ['Belgium', '+32'], ['Brazil', '+55'], ['Bulgaria', '+359'], ['Cambodia', '+855'],
  ['Cameroon', '+237'], ['Canada', '+1'], ['Chile', '+56'], ['China', '+86'],
  ['Colombia', '+57'], ['Croatia', '+385'], ['Cyprus', '+357'], ['Czechia', '+420'],
  ['Denmark', '+45'], ['Egypt', '+20'], ['Ethiopia', '+251'], ['Finland', '+358'],
  ['France', '+33'], ['Georgia', '+995'], ['Germany', '+49'], ['Ghana', '+233'],
  ['Greece', '+30'], ['India', '+91'], ['Indonesia', '+62'], ['Iran', '+98'],
  ['Iraq', '+964'], ['Ireland', '+353'], ['Italy', '+39'], ['Japan', '+81'],
  ['Jordan', '+962'], ['Kazakhstan', '+7'], ['Kenya', '+254'], ['Kuwait', '+965'],
  ['Lebanon', '+961'], ['Malaysia', '+60'], ['Mexico', '+52'], ['Morocco', '+212'],
  ['Nepal', '+977'], ['Netherlands', '+31'], ['New Zealand', '+64'], ['Nigeria', '+234'],
  ['Norway', '+47'], ['Oman', '+968'], ['Pakistan', '+92'], ['Palestine', '+970'],
  ['Philippines', '+63'], ['Poland', '+48'], ['Portugal', '+351'], ['Qatar', '+974'],
  ['Romania', '+40'], ['Russia', '+7'], ['Saudi Arabia', '+966'], ['Singapore', '+65'],
  ['South Africa', '+27'], ['South Korea', '+82'], ['Spain', '+34'], ['Sri Lanka', '+94'],
  ['Sweden', '+46'], ['Switzerland', '+41'], ['Syria', '+963'], ['Taiwan', '+886'],
  ['Thailand', '+66'], ['Tunisia', '+216'], ['Turkey', '+90'], ['Ukraine', '+380'],
  ['United Arab Emirates', '+971'], ['United Kingdom', '+44'], ['United States', '+1'],
  ['Vietnam', '+84'], ['Yemen', '+967'],
].map(([country, code]) => ({ country, code }))

function dateValue(value) {
  return value ? String(value).slice(0, 10) : ''
}

function displayDate(value) {
  if (!value) return ''
  const dateText = String(value)
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateText) ? `${dateText}T00:00:00` : dateText)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

function uploadedFileName(path) {
  return String(path ?? '').split('/').pop() || ''
}

function todayValue() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function formFromApplication(application) {
  const savedPhone = application.phone_number ?? ''
  const savedPhoneCode = phoneCountryCodes
    .map(({ code }) => code)
    .sort((first, second) => second.length - first.length)
    .find((code) => savedPhone.startsWith(code)) || ''
  return {
    ...emptyForm,
    ...application,
    ...Object.fromEntries(
      Object.entries(emptyForm)
        .filter(([, value]) => typeof value === 'string')
        .map(([field, emptyValue]) => [field, application[field] ?? emptyValue]),
    ),
    birthdate: dateValue(application.birthdate),
    passport_expiry_date: dateValue(application.passport_expiry_date),
    expected_graduation_date: dateValue(application.expected_graduation_date),
    gpa: application.gpa ?? '',
    max_gpa: application.max_gpa ?? '',
    credits_passed: application.credits_passed ?? '',
    max_credits: application.max_credits ?? '',
    nationality: application.nationality ?? '',
    passport_issuing_country: application.passport_issuing_country ?? '',
    is_whatsapp_available: application.is_whatsapp_available ?? false,
    phone_number: savedPhoneCode ? savedPhone.slice(savedPhoneCode.length) : savedPhone,
    phone_country_code: savedPhoneCode,
  }
}

function generateApplicationId() {
  const randomValues = new Uint32Array(1)
  crypto.getRandomValues(randomValues)
  return 100_000_000 + (randomValues[0] % 2_000_000_000)
}

function isCycleOpen(cycle) {
  const opensAt = Date.parse(cycle.application_o)
  const closesAt = Date.parse(cycle.application_c)
  const now = Date.now()
  return Number.isFinite(opensAt) && Number.isFinite(closesAt) && opensAt <= now && now <= closesAt
}

function isNominationCycleAvailable(cycle) {
  const endsAt = Date.parse(cycle?.cycle_end)
  return Boolean(cycle && isCycleOpen(cycle) && Number.isFinite(endsAt) && endsAt > Date.now())
}

function getBirthdateError(value) {
  if (value && value >= todayValue()) {
    return 'Date of birth must be in the past.'
  }
  return ''
}

function InputField({ label, name, value, onChange, type = 'text', required = false, error = '', ...props }) {
  return (
    <label className="outbound-form__field">
      <span>{label}{required && <span className="outbound-form__required" aria-hidden="true"> *</span>}</span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        {...props}
      />
      {error && <span className="outbound-form__field-error" id={`${name}-error`}>{error}</span>}
    </label>
  )
}

function SelectField({ label, name, value, onChange, children, required = false }) {
  return (
    <label className="outbound-form__field">
      <span>{label}{required && <span className="outbound-form__required" aria-hidden="true"> *</span>}</span>
      <select name={name} value={value} onChange={onChange} required={required}>
        {children}
      </select>
    </label>
  )
}

function FileField({ label, name, value, onUpload, uploading, required = false, accept = '.pdf,.jpg,.jpeg,.png' }) {
  const fileName = String(value || '').split('/').pop()
  return (
    <label className="outbound-form__field">
      <span>{label}{required && <span className="outbound-form__required" aria-hidden="true"> *</span>}</span>
      <input type="file" accept={accept} onChange={(event) => onUpload(name, event)} />
      {uploading[name] && <span role="status">Uploading…</span>}
      {fileName && !uploading[name] && (
        <p className="outbound-form__upload-success" role="status">{fileName} uploaded successfully.</p>
      )}
    </label>
  )
}

function InboundApplicationReceipt({ application, studentId, countries, cycles, universities, onBack, onRequestWithdrawal, withdrawalState, withdrawalReason, isConfirmingWithdrawal, onWithdrawalReasonChange, onCancelWithdrawal }) {
  const [uploadedPages, setUploadedPages] = useState([])
  const [documentsError, setDocumentsError] = useState('')
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [viewingPage, setViewingPage] = useState(null)
  const receiptRef = useRef(null)
  const countryName = (id) => countries.find((country) => Number(country.id) === Number(id))?.name || ''
  const cycle = cycles.find((item) => Number(item.id) === Number(application.semester_applied_for))
  const university = universities.find((item) => Number(item.university_id) === Number(application.university_id))
  const details = [
    ['Student ID', studentId],
    ['Nomination ID', application.nomination_id],
    ['First name', application.first_name],
    ['Middle name', application.middle_name],
    ['Last name', application.last_name],
    ['Gender', application.gender],
    ['Date of birth', displayDate(application.birthdate)],
    ['Email', application.email],
    ['Phone number', application.phone_number],
    ['WhatsApp available', application.is_whatsapp_available ? 'Yes' : 'No'],
    ['Country of residence', application.country_of_residence],
    ['Nationality', countryName(application.nationality)],
    ['Passport number', application.passport_number],
    ['Passport expiry date', displayDate(application.passport_expiry_date)],
    ['Passport issuing country', countryName(application.passport_issuing_country)],
    ['Major or field of study', application.major],
    ['Current year of study', application.current_year_of_study],
    ['GPA', application.gpa],
    ['Maximum GPA', application.max_gpa],
    ['Credits passed', application.credits_passed],
    ['Maximum credits', application.max_credits],
    ['Expected graduation date', displayDate(application.expected_graduation_date)],
    ['Exchange cycle', cycle ? `${cycle.semester} ${cycle.academic_year}` : application.semester_applied_for],
    ['Host university', university?.name || application.university_id],
    ['Academic transcript', uploadedFileName(application.transcript)],
    ['English proficiency document', uploadedFileName(application.language_proficiency)],
    ['Passport copy', uploadedFileName(application.passport_copy)],
    ['Profile photo', uploadedFileName(application.profile_photo)],
    ['Terms and conditions accepted', application.tos ? 'Yes' : 'No'],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '')
  const statusClass = String(application.application_status || 'Unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  useEffect(() => {
    let current = true

    async function loadUploadedPages() {
      setUploadedPages([])
      setDocumentsError('')
      setDocumentsLoading(true)
      const files = [
        ['Academic transcript', application.transcript],
        ['English proficiency document', application.language_proficiency],
        ['Passport copy', application.passport_copy],
        ['Profile photo', application.profile_photo],
      ].filter(([, path]) => Boolean(path))

      const pages = await Promise.all(files.map(async ([label, path]) => {
        const storage = supabase.storage.from(storageBucket)
        const fileName = uploadedFileName(path)
        const [viewResult, downloadResult] = await Promise.all([
          storage.createSignedUrl(path, 3600),
          storage.createSignedUrl(path, 3600, { download: fileName }),
        ])
        if (viewResult.error) throw viewResult.error
        if (downloadResult.error) throw downloadResult.error

        if (/\.pdf$/i.test(fileName)) {
          const { data: fileData, error: fileError } = await storage.download(path)
          if (fileError) throw fileError
          const pdfjsLib = await import('pdfjs-dist')
          pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker
          const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(await fileData.arrayBuffer()),
          })
          try {
            const pdf = await loadingTask.promise
            const pdfPages = []
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
              const page = await pdf.getPage(pageNumber)
              const originalViewport = page.getViewport({ scale: 1 })
              const scale = Math.min(2, 1400 / originalViewport.width)
              const viewport = page.getViewport({ scale })
              const canvas = document.createElement('canvas')
              canvas.width = Math.ceil(viewport.width)
              canvas.height = Math.ceil(viewport.height)
              const context = canvas.getContext('2d')
              if (!context) throw new Error('A canvas context could not be created to display a PDF page.')
              await page.render({ canvas, canvasContext: context, viewport }).promise
              pdfPages.push({
                key: `${path}-${pageNumber}`,
                label,
                fileName,
                previewUrl: canvas.toDataURL('image/png'),
                downloadUrl: downloadResult.data.signedUrl,
                pageNumber,
                pageCount: pdf.numPages,
              })
              page.cleanup()
            }
            return pdfPages
          } finally {
            await loadingTask.destroy()
          }
        }

        return [{
          key: path,
          label,
          fileName,
          previewUrl: viewResult.data.signedUrl,
          downloadUrl: downloadResult.data.signedUrl,
          pageNumber: null,
          pageCount: null,
        }]
      }))
      if (current) {
        setUploadedPages(pages.flat())
        setDocumentsLoading(false)
      }
    }

    loadUploadedPages().catch((loadError) => {
      if (current) {
        setDocumentsError(`Uploaded documents could not be loaded: ${getDatabaseErrorMessage(loadError)}`)
        setDocumentsLoading(false)
      }
    })
    return () => { current = false }
  }, [application.application_id, application.language_proficiency, application.passport_copy, application.profile_photo, application.transcript])

  useEffect(() => {
    if (!viewingPage) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setViewingPage(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [viewingPage])

  const handleDownload = () => {
    if (!receiptRef.current) return
    window.print()
  }

  return (
    <section ref={receiptRef} className="outbound-receipt" aria-labelledby="inbound-receipt-heading">
      <header className="outbound-receipt__brand">
        <img src={`${import.meta.env.BASE_URL}images/kulogolightmode.png`} alt="Kuwait University" />
        <img src={`${import.meta.env.BASE_URL}images/exchangelogoeng.png`} alt="Kuwait University Exchange Program" />
      </header>
      <span className="auth-card__eyebrow">{application.application_status === 'Rejected' ? 'Application not submitted' : 'Application submitted'}</span>
      <h1 id="inbound-receipt-heading">{application.application_status === 'Rejected' ? 'Your application was not submitted' : 'Your application was submitted successfully'}</h1>
      <p>{application.application_status === 'Rejected' ? 'This application was not submitted before the deadline.' : 'Keep this summary for your records.'}</p>
      <dl className="outbound-receipt__metadata">
        <div><dt>Application ID</dt><dd>{application.application_id}</dd></div>
        <div><dt>Submission date</dt><dd>{displayDate(application.submitted_at || application.created_at)}</dd></div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className={`outbound-receipt__status outbound-receipt__status--${statusClass}`}>
              {application.application_status}
            </span>
          </dd>
        </div>
      </dl>
      <h2>Application details</h2>
      <dl className="outbound-receipt__details">
        {details.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>
        ))}
      </dl>
      {uploadedPages.length > 0 && (
        <section className="outbound-receipt__images" aria-labelledby="inbound-receipt-documents-heading">
          <h2 id="inbound-receipt-documents-heading">Uploaded documents and images</h2>
          <div className="outbound-receipt__image-grid">
            {uploadedPages.map((page) => (
              <figure key={page.key}>
                <img src={page.previewUrl} alt={`${page.label}${page.pageNumber ? `, page ${page.pageNumber}` : ''}`} />
                <figcaption>
                  {page.label}{page.pageNumber ? ` — page ${page.pageNumber} of ${page.pageCount}` : ''}
                </figcaption>
                <p className="outbound-receipt__image-filename">{page.fileName}</p>
                <div className="outbound-receipt__image-actions">
                  <button className="btn btn--secondary" type="button" onClick={() => setViewingPage(page)}>
                    View
                  </button>
                  <a className="btn btn--secondary" href={page.downloadUrl}>
                    Download
                  </a>
                </div>
              </figure>
            ))}
          </div>
        </section>
      )}
      {documentsLoading && <p role="status">Preparing uploaded documents…</p>}
      {documentsError && <p className="outbound-application__error" role="alert">{documentsError}</p>}
      {withdrawalState.error && <p className="outbound-application__error" role="alert">{withdrawalState.error}</p>}
      {withdrawalState.message && <p className="outbound-application__message" role="status">{withdrawalState.message}</p>}
      {viewingPage && (
        <div className="outbound-receipt__viewer-backdrop" onClick={() => setViewingPage(null)}>
          <section
            className="outbound-receipt__viewer"
            role="dialog"
            aria-modal="true"
            aria-label={`View ${viewingPage.label}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button className="outbound-receipt__viewer-close" type="button" onClick={() => setViewingPage(null)}>
              Close
            </button>
            <img src={viewingPage.previewUrl} alt={viewingPage.label} />
            <p>{viewingPage.label}{viewingPage.pageNumber ? ` — page ${viewingPage.pageNumber} of ${viewingPage.pageCount}` : ''}: {viewingPage.fileName}</p>
          </section>
        </div>
      )}
      <div className="outbound-receipt__actions">
        {['Submitted', 'Pending Interview'].includes(application.application_status) && (
          <div className="outbound-receipt__withdrawal">
            {!isConfirmingWithdrawal ? (
              <button className="btn btn--danger" type="button" onClick={onRequestWithdrawal} disabled={withdrawalState.loading}>
                Request withdrawal
              </button>
            ) : (
              <>
                <label className="outbound-receipt__withdrawal-label" htmlFor="inbound-withdrawal-reason">
                  Reason for withdrawal <span>(optional)</span>
                </label>
                <textarea
                  id="inbound-withdrawal-reason"
                  value={withdrawalReason}
                  onChange={onWithdrawalReasonChange}
                  placeholder="Share a short reason for your request..."
                  rows="3"
                />
                <div className="outbound-receipt__withdrawal-actions">
                  <button className="btn btn--danger" type="button" onClick={onRequestWithdrawal} disabled={withdrawalState.loading}>
                    {withdrawalState.loading ? 'Requesting withdrawal...' : 'Confirm withdrawal'}
                  </button>
                  <button className="btn btn--secondary" type="button" onClick={onCancelWithdrawal} disabled={withdrawalState.loading}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {application.application_status !== 'Draft' && (
          <button
            className="btn btn--primary"
            type="button"
            onClick={handleDownload}
            disabled={documentsLoading || Boolean(documentsError)}
          >
            Download PDF
          </button>
        )}
        <button className="btn btn--secondary" type="button" onClick={onBack}>Back to applications</button>
      </div>
    </section>
  )
}

function InboundApplication() {
  const user = useAppStore((state) => state.session?.user)
  const location = useLocation()
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [cycles, setCycles] = useState([])
  const [countries, setCountries] = useState([])
  const [universities, setUniversities] = useState([])
  const [applications, setApplications] = useState([])
  const [submittedApplication, setSubmittedApplication] = useState(null)
  const [receiptError, setReceiptError] = useState('')
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [withdrawalState, setWithdrawalState] = useState({ loading: false, error: '', message: '' })
  const [withdrawalReason, setWithdrawalReason] = useState('')
  const [isConfirmingWithdrawal, setIsConfirmingWithdrawal] = useState(false)
  const [nomination, setNomination] = useState(null)
  const [nominationInput, setNominationInput] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [applicationId, setApplicationId] = useState(null)
  const [acceptedTerms, setAcceptedTerms] = useState(terms.map(() => false))
  const [hasUserEdited, setHasUserEdited] = useState(false)
  const [draftSaveStatus, setDraftSaveStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState({})
  const [error, setError] = useState('')
  const [scrollProgress, setScrollProgress] = useState(0)
  const pageContentRef = useRef(null)
  const wizardScrollRef = useRef(null)
  const autosaveTimerRef = useRef(null)
  const lastSavedFormRef = useRef('')
  const initializedNominationRouteRef = useRef(null)
  const wizardSegments = location.pathname.split('/portal/inbound-application/')[1]?.split('/').filter(Boolean) || []
  const routeStep = steps.findIndex(({ path }) => path === wizardSegments[wizardSegments.length - 1])
  const routeApplicationId = routeStep >= 0 && wizardSegments[0] !== 'new' ? wizardSegments[0] : null
  const routeNominationId = wizardSegments[0] === 'new' ? wizardSegments[1] : null
  const submittedRouteId = wizardSegments.length === 2 && wizardSegments[1] === 'submitted' ? wizardSegments[0] : null
  const activeStep = routeStep
  const canSubmit = acceptedTerms.every(Boolean)
  const openCycles = useMemo(() => cycles.filter(isCycleOpen), [cycles])
  const birthdateError = getBirthdateError(form.birthdate)

  const requestWithdrawal = async () => {
    if (!submittedApplication || !['Submitted', 'Pending Interview'].includes(submittedApplication.application_status)) return
    if (!isConfirmingWithdrawal) {
      setIsConfirmingWithdrawal(true)
      return
    }
    setWithdrawalState({ loading: true, error: '', message: '' })
    const { data, error: withdrawalError } = await supabase.rpc('request_inbound_withdrawal', {
      requested_application_id: Number(submittedApplication.application_id),
      requested_reason: withdrawalReason,
    })
    if (withdrawalError || !data) {
      setWithdrawalState({ loading: false, error: getDatabaseErrorMessage(withdrawalError), message: '' })
      return
    }
    setSubmittedApplication(data)
    setApplications((current) => current.map((item) => item.application_id === data.application_id
      ? { ...item, application_status: data.application_status }
      : item))
    setIsConfirmingWithdrawal(false)
    setWithdrawalState({ loading: false, error: '', message: 'Withdrawal requested. The coordinator will review it.' })
  }

  useEffect(() => {
    const pageContent = pageContentRef.current
    const wizardScroller = wizardScrollRef.current
    if (!pageContent || !wizardScroller) return undefined

    let animationFrame = 0
    pageContent.scrollTop = 0
    wizardScroller.scrollTop = 0
    const updateProgress = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        const fieldScrollDistance = Math.max(0, pageContent.scrollHeight - pageContent.clientHeight)
        const pageScrollDistance = Math.max(0, wizardScroller.scrollHeight - wizardScroller.clientHeight)
        const windowScrollDistance = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
        const totalScrollDistance = fieldScrollDistance + pageScrollDistance + windowScrollDistance
        if (totalScrollDistance === 0) {
          setScrollProgress(100)
          return
        }

        const progress = ((pageContent.scrollTop + wizardScroller.scrollTop + window.scrollY) / totalScrollDistance) * 100
        setScrollProgress(Math.max(0, Math.min(100, progress)))
      })
    }

    updateProgress()
    window.addEventListener('resize', updateProgress)
    window.addEventListener('scroll', updateProgress, { passive: true })
    wizardScroller.addEventListener('scroll', updateProgress, { passive: true })
    pageContent.addEventListener('scroll', updateProgress, { passive: true })
    const resizeObserver = new ResizeObserver(updateProgress)
    resizeObserver.observe(pageContent)
    resizeObserver.observe(wizardScroller)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', updateProgress)
      window.removeEventListener('scroll', updateProgress)
      wizardScroller.removeEventListener('scroll', updateProgress)
      pageContent.removeEventListener('scroll', updateProgress)
      resizeObserver.disconnect()
    }
  }, [activeStep, loading, location.pathname, routeApplicationId])

  useEffect(() => {
    let current = true

    async function loadPortalData() {
      setLoading(true)
      setError('')
      if (!user.email_confirmed_at) {
        setError('Verify your email address before opening the inbound application portal.')
        setLoading(false)
        return
      }

      const { data: studentRecord, error: studentError } = await supabase
        .from('incomingstudentauth')
        .select('student_id, student_email, name')
        .eq('user_id', user.id)
        .maybeSingle()
      if (studentError) {
        setError(getDatabaseErrorMessage(studentError))
        setLoading(false)
        return
      }
      if (!studentRecord || studentRecord.student_email?.trim().toLowerCase() !== user.email?.trim().toLowerCase()) {
        setError('Your account is not linked to a matching incoming-student profile.')
        setLoading(false)
        return
      }

      const [cycleResult, countryResult, universityResult, applicationResult] = await Promise.all([
        supabase.from('exchange_cycle').select('id, semester, academic_year, application_o, application_c, cycle_end').order('id', { ascending: false }),
        supabase.from('country').select('id, name').order('name'),
        supabase.from('partneruniversity').select('university_id, name').order('name'),
        supabase.from('inboundapplication')
          .select('application_id, application_status, semester_applied_for, nomination_id, created_at')
          .eq('student_id', studentRecord.student_id)
          .order('created_at', { ascending: false }),
      ])
      const loadError = cycleResult.error || countryResult.error || universityResult.error || applicationResult.error
      if (loadError) {
        if (current) {
          setError(getDatabaseErrorMessage(loadError))
          setLoading(false)
        }
        return
      }

      if (current) {
        setStudent(studentRecord)
        setCycles(cycleResult.data || [])
        setCountries(countryResult.data || [])
        setUniversities(universityResult.data || [])
        setApplications(applicationResult.data || [])
        setForm((existing) => ({ ...existing, email: studentRecord.student_email }))
        setLoading(false)
      }
    }

    loadPortalData()
    return () => { current = false }
  }, [user.email, user.email_confirmed_at, user.id])

  useEffect(() => {
    if (!routeNominationId) initializedNominationRouteRef.current = null
  }, [routeNominationId])

  useEffect(() => {
    if (!student || !routeNominationId) return undefined
    if (applicationId && initializedNominationRouteRef.current === String(routeNominationId)) return undefined
    let current = true

    async function loadNominationFromRoute() {
      setLoading(true)
      const { data, error: nominationError } = await supabase
        .from('studentnominations')
        .select('id, semester, student_name, student_email, nomination_status')
        .eq('id', routeNominationId)
        .ilike('student_email', student.student_email)
        .eq('nomination_status', 'Active')
        .maybeSingle()
      if (!current) return
      if (nominationError) {
        setError(getDatabaseErrorMessage(nominationError))
        setLoading(false)
        return
      }
      const cycle = cycles.find((item) => Number(item.id) === Number(data?.semester))
      const used = applications.some((item) => (
        Number(item.semester_applied_for) === Number(data?.semester)
        && String(item.application_id) !== String(applicationId)
      ))
      if (!data || !isNominationCycleAvailable(cycle) || used) {
        setError(used
          ? 'You already have an application for this exchange cycle. Continue your existing draft from your applications list.'
          : 'The nomination is invalid, expired, or its exchange cycle is not accepting applications.')
        setLoading(false)
        navigate('/portal/inbound-application', { replace: true })
        return
      }
      initializedNominationRouteRef.current = String(data.id)
      setNomination({ ...data, cycle })
      setForm({ ...emptyForm, email: student.student_email, semester_applied_for: String(data.semester) })
      setApplicationId(null)
      setHasUserEdited(false)
      setDraftSaveStatus('')
      lastSavedFormRef.current = ''
      setAcceptedTerms(terms.map(() => false))
      setError('')
      setLoading(false)
    }

    loadNominationFromRoute()
    return () => { current = false }
  }, [applicationId, applications, cycles, navigate, routeNominationId, student])

  useEffect(() => {
    if (!student || !routeApplicationId || routeApplicationId === String(applicationId)) return undefined
    let current = true

    async function loadDraft() {
      setLoading(true)
      const { data, error: applicationError } = await supabase
        .from('inboundapplication')
        .select('*')
        .eq('application_id', routeApplicationId)
        .eq('student_id', student.student_id)
        .maybeSingle()
      if (!current) return
      if (applicationError || !data || data.application_status !== 'Draft') {
        setError(applicationError ? getDatabaseErrorMessage(applicationError) : 'Only your draft applications can be continued.')
        setLoading(false)
        navigate('/portal/inbound-application', { replace: true })
        return
      }
      const { data: nominationData, error: nominationError } = await supabase
        .from('studentnominations')
        .select('id, semester, student_name, student_email, nomination_status')
        .eq('id', data.nomination_id)
        .ilike('student_email', student.student_email)
        .maybeSingle()
      if (!current) return
      if (nominationError || !nominationData) {
        setError(nominationError ? getDatabaseErrorMessage(nominationError) : 'The nomination for this draft could not be verified.')
        setLoading(false)
        navigate('/portal/inbound-application', { replace: true })
        return
      }
      setNomination({
        ...nominationData,
        cycle: cycles.find((item) => Number(item.id) === Number(nominationData.semester)),
      })
      const draftForm = formFromApplication(data)
      setForm(draftForm)
      setHasUserEdited(false)
      setDraftSaveStatus('saved')
      lastSavedFormRef.current = JSON.stringify(draftForm)
      setApplicationId(data.application_id)
      setAcceptedTerms(terms.map(() => false))
      setLoading(false)
    }

    loadDraft()
    return () => { current = false }
  }, [applicationId, cycles, navigate, routeApplicationId, student])

  useEffect(() => {
    if (!student || !routeApplicationId) return undefined
    let current = true
    const checkDraftStatus = async () => {
      const { data, error: statusError } = await supabase
        .from('inboundapplication')
        .select('application_status')
        .eq('application_id', routeApplicationId)
        .eq('student_id', student.student_id)
        .maybeSingle()
      if (!current || statusError || !data || data.application_status === 'Draft') return

      setApplications((items) => items.map((item) => (
        String(item.application_id) === String(routeApplicationId)
          ? { ...item, application_status: data.application_status }
          : item
      )))
      navigate(`/portal/inbound-application/${routeApplicationId}/submitted`, { replace: true })
    }
    checkDraftStatus()
    const intervalId = window.setInterval(checkDraftStatus, 15000)
    return () => {
      current = false
      window.clearInterval(intervalId)
    }
  }, [navigate, routeApplicationId, student])

  useEffect(() => {
    if (!student || !submittedRouteId) return undefined
    let current = true

    async function loadSubmittedApplication() {
      setReceiptLoading(true)
      setReceiptError('')
      const { data, error: applicationError } = await supabase
        .from('inboundapplication')
        .select('*')
        .eq('application_id', submittedRouteId)
        .eq('student_id', student.student_id)
        .maybeSingle()
      if (!current) return
      if (applicationError) {
        setSubmittedApplication(null)
        setReceiptError(getDatabaseErrorMessage(applicationError))
      } else if (!data || data.application_status === 'Draft') {
        setSubmittedApplication(null)
        setReceiptError('Not allowed to view this application.')
      } else {
        setSubmittedApplication(data)
      }
      setReceiptLoading(false)
    }

    loadSubmittedApplication()
    return () => { current = false }
  }, [student, submittedRouteId])

  const validateStep = useCallback((stepIndex) => {
    if (stepIndex === 0) {
      if (!form.first_name.trim() || !form.last_name.trim()) return 'Enter your first and last name.'
      if (!form.gender) return 'Select your gender.'
      if (!form.birthdate) return 'Enter your date of birth.'
      if (birthdateError) return birthdateError
      if (!form.email.trim()) return 'An email address is required.'
      if (form.phone_number) {
        const fullDigits = `${form.phone_country_code}${form.phone_number}`.replace(/\D/g, '')
        if (!form.phone_country_code) return 'Select a country calling code.'
        if (!/^[0-9() -]+$/.test(form.phone_number) || fullDigits.length < 7 || fullDigits.length > 15) {
          return 'Enter a phone number with 7 to 15 digits.'
        }
      }
      if (form.passport_expiry_date && form.passport_expiry_date < todayValue()) {
        return 'Passport must not be expired.'
      }
    }
    if (stepIndex === 1) {
      if (requiredAcademicFields.some((field) => !String(form[field] ?? '').trim())) return 'Complete the required academic information.'
      const gpa = Number(form.gpa)
      const maxGpa = Number(form.max_gpa)
      if (!Number.isFinite(gpa) || !Number.isFinite(maxGpa) || maxGpa <= 0 || gpa < 0 || gpa > maxGpa) {
        return 'GPA must be between 0 and the maximum GPA.'
      }
      const passed = Number(form.credits_passed)
      const maximum = Number(form.max_credits)
      if (!Number.isInteger(passed) || !Number.isInteger(maximum) || passed < 0 || maximum < 0 || passed > maximum) {
        return 'Credits passed must be a whole number no greater than the maximum credits.'
      }
      if (form.expected_graduation_date <= todayValue()) {
        return 'Expected graduation date must be in the future.'
      }
    }
    if (stepIndex === 2 && (!nomination || !isNominationCycleAvailable(nomination.cycle))) {
      return 'The nomination does not have an available exchange cycle.'
    }
    if (stepIndex === 2 && Number(form.semester_applied_for) !== Number(nomination.semester)) {
      return 'Choose the exchange cycle associated with your nomination.'
    }
    return ''
  }, [birthdateError, form, nomination])

  const updateField = (event) => {
    const { name, value, checked, type } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
    setHasUserEdited(true)
    setDraftSaveStatus('pending')
    setError('')
  }

  const saveApplication = useCallback(async (submit = false) => {
    if (!student || !nomination) {
      setError('Validate an active nomination before saving an application.')
      return null
    }
    const validationError = submit ? [0, 1, 2].map(validateStep).find(Boolean) : ''
    if (validationError) {
      setError(validationError)
      return null
    }
    const formSignature = JSON.stringify(form)
    setSaving(true)
    if (!submit) setDraftSaveStatus('saving')
    setError('')
    try {
      const { phone_country_code: phoneCountryCode, ...applicationFields } = form
      const payload = {
        ...applicationFields,
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        middle_name: form.middle_name.trim() || null,
        birthdate: form.birthdate || null,
        profile_photo: form.profile_photo || null,
        country_of_residence: form.country_of_residence.trim() || null,
        passport_number: form.passport_number.trim() || null,
        passport_expiry_date: form.passport_expiry_date || null,
        passport_copy: form.passport_copy || null,
        max_gpa: form.max_gpa === '' ? null : Number(form.max_gpa),
        gpa: form.gpa === '' ? null : Number(form.gpa),
        expected_graduation_date: form.expected_graduation_date || null,
        credits_passed: form.credits_passed === '' ? null : Number(form.credits_passed),
        max_credits: form.max_credits === '' ? null : Number(form.max_credits),
        email: student.student_email,
        phone_number: form.phone_number.trim()
          ? `${phoneCountryCode}${form.phone_number.trim().replace(/^0+/, '')}`
          : null,
        major: form.major.trim() || null,
        transcript: form.transcript || null,
        language_proficiency: form.language_proficiency || null,
        current_year_of_study: form.current_year_of_study || null,
        tos: false,
        passport_issuing_country: form.passport_issuing_country ? Number(form.passport_issuing_country) : null,
        nationality: form.nationality ? Number(form.nationality) : null,
        semester_applied_for: Number(form.semester_applied_for || nomination.semester),
        student_id: student.student_id,
        nomination_id: nomination.id,
        application_status: 'Draft',
      }
      let savedApplicationId = applicationId
      if (applicationId) {
        const { data, error: updateError } = await supabase
          .from('inboundapplication')
          .update(payload)
          .eq('application_id', applicationId)
          .eq('student_id', student.student_id)
          .eq('application_status', 'Draft')
          .select('application_id')
          .maybeSingle()
        if (updateError || !data) {
          setError(updateError ? getDatabaseErrorMessage(updateError) : 'The draft was not saved. Check your access and try again.')
          return null
        }
        savedApplicationId = data.application_id
      } else {
        let inserted
        let insertError
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const result = await supabase.from('inboundapplication')
            .insert({ ...payload, application_id: generateApplicationId() })
            .select('application_id')
            .single()
          if (!result.error) {
            inserted = result.data
            insertError = null
            break
          }
          insertError = result.error
          if (result.error.code !== '23505') break
        }
        if (insertError || !inserted) {
          setError(insertError?.code === '23505'
            ? 'You already have an application for this exchange cycle.'
            : getDatabaseErrorMessage(insertError))
          return null
        }
        savedApplicationId = inserted.application_id
        setApplicationId(savedApplicationId)
      }

      const submissionTimestamp = submit ? new Date().toISOString() : null
      if (submit) {
        const { data, error: submitError } = await supabase
          .from('inboundapplication')
          .update({ application_status: 'Submitted', submitted_at: submissionTimestamp, tos: true })
          .eq('application_id', savedApplicationId)
          .eq('student_id', student.student_id)
          .eq('application_status', 'Draft')
          .select('application_id')
          .maybeSingle()
        if (submitError || !data) {
          setError(submitError ? getDatabaseErrorMessage(submitError) : 'The application was saved as a draft but could not be submitted.')
          return null
        }
      }

      const listEntry = {
        application_id: savedApplicationId,
        application_status: submit ? 'Submitted' : 'Draft',
        semester_applied_for: nomination.semester,
        nomination_id: nomination.id,
        created_at: new Date().toISOString(),
        submitted_at: submissionTimestamp,
      }
      setApplications((current) => [listEntry, ...current.filter((item) => item.application_id !== savedApplicationId)])
      lastSavedFormRef.current = formSignature
      if (!submit) setDraftSaveStatus('saved')
      return savedApplicationId
    } catch (saveError) {
      setError(getDatabaseErrorMessage(saveError))
      if (!submit) setDraftSaveStatus('error')
      return null
    } finally {
      setSaving(false)
    }
  }, [applicationId, form, nomination, student, validateStep])

  useEffect(() => {
    if (!student || !nomination || routeStep < 0 || loading || saving || !hasUserEdited) return undefined
    const formSignature = JSON.stringify(form)
    if (formSignature === lastSavedFormRef.current) return undefined

    autosaveTimerRef.current = window.setTimeout(async () => {
      setDraftSaveStatus('saving')
      const savedId = await saveApplication()
      if (!savedId) {
        setDraftSaveStatus('error')
      } else if (!applicationId) {
        navigate(`/portal/inbound-application/${savedId}/${steps[0].path}`, { replace: true })
      }
    }, 700)

    return () => window.clearTimeout(autosaveTimerRef.current)
  }, [applicationId, form, hasUserEdited, loading, navigate, nomination, routeStep, saveApplication, saving, student])

  const beginWithNomination = async (event) => {
    event.preventDefault()
    const id = nominationInput.trim()
    if (!/^\d+$/.test(id)) {
      setError('Enter the numeric Nomination ID provided by your home university.')
      return
    }
    setLoading(true)
    setError('')
    const { data, error: nominationError } = await supabase
      .from('studentnominations')
      .select('id, semester, student_name, student_email, nomination_status')
      .eq('id', id)
      .ilike('student_email', student.student_email)
      .eq('nomination_status', 'Active')
      .maybeSingle()
    if (nominationError) {
      setError(getDatabaseErrorMessage(nominationError))
      setLoading(false)
      return
    }
    if (!data) {
      setError('That Nomination ID is invalid, inactive, or belongs to another student.')
      setLoading(false)
      return
    }
    if (applications.some((item) => Number(item.semester_applied_for) === Number(data.semester))) {
      setError('You already have an application for this exchange cycle. Continue your existing draft from your applications list.')
      setLoading(false)
      return
    }
    const cycle = cycles.find((item) => Number(item.id) === Number(data.semester))
    if (!isNominationCycleAvailable(cycle)) {
      setError('The exchange cycle associated with this nomination is not accepting applications.')
      setLoading(false)
      return
    }
    if (applications.some((item) => Number(item.nomination_id) === Number(data.id))) {
      setError('This nomination has already been used for an application.')
      setLoading(false)
      return
    }
    setLoading(false)
    navigate(`/portal/inbound-application/new/${data.id}/${steps[0].path}`)
  }

  const openDraft = async (id) => {
    navigate(`/portal/inbound-application/${id}/${steps[0].path}`)
  }

  const handleNext = async (event) => {
    event.preventDefault()
    window.clearTimeout(autosaveTimerRef.current)
    const validationError = validateStep(activeStep)
    if (validationError) {
      setError(validationError)
      return
    }
    const savedId = await saveApplication()
    if (!savedId) return
    const nextStep = Math.min(activeStep + 1, steps.length - 1)
    navigate(`/portal/inbound-application/${savedId}/${steps[nextStep].path}`)
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    window.clearTimeout(autosaveTimerRef.current)
    const savedId = await saveApplication(true)
    if (savedId) navigate(`/portal/inbound-application/${savedId}/submitted`)
  }

  const handleBack = async (pageIndex) => {
    window.clearTimeout(autosaveTimerRef.current)
    if (hasUserEdited && JSON.stringify(form) !== lastSavedFormRef.current) {
      const savedId = await saveApplication()
      if (!savedId) return
    }
    if (pageIndex === 0) navigate('/portal/inbound-application')
    else navigate(`/portal/inbound-application/${routeApplicationId || `new/${routeNominationId}`}/${steps[pageIndex - 1].path}`)
  }

  const uploadFile = async (field, event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!applicationId) {
      setError('Save your draft before uploading documents.')
      return
    }
    const allowedTypes = field === 'profile_photo'
      ? ['image/jpeg', 'image/png']
      : ['application/pdf', 'image/jpeg', 'image/png']
    if (file.size > 10 * 1024 * 1024) {
      setError('Choose a file no larger than 10 MB.')
      return
    }
    if (!allowedTypes.includes(file.type)) {
      setError(field === 'profile_photo'
        ? 'Profile photos must be JPEG or PNG files.'
        : 'Choose a PDF, JPEG, or PNG file.')
      return
    }
    setUploading((current) => ({ ...current, [field]: true }))
    setError('')
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
    const path = `${student.student_id}/${applicationId}/${field}/${crypto.randomUUID()}-${safeName}`
    const { data, error: uploadError } = await supabase.storage.from(storageBucket).upload(path, file, {
      contentType: file.type,
      upsert: false,
    })
    if (uploadError) {
      const bucketNotFound = uploadError.message.toLowerCase().includes('bucket not found')
      setError(bucketNotFound
        ? `File upload failed: The "${storageBucket}" bucket does not exist in this Supabase project. Run the inbound bucket INSERT from db/schemanew.sql in this project's SQL Editor, then retry.`
        : `File upload failed: ${getDatabaseErrorMessage(uploadError)} Confirm the private "${storageBucket}" bucket and its policies are configured.`)
      setUploading((current) => ({ ...current, [field]: false }))
      return
    }
    const { data: updatedRow, error: updateError } = await supabase
      .from('inboundapplication')
      .update({ [field]: data.path })
      .eq('application_id', applicationId)
      .eq('student_id', student.student_id)
      .eq('application_status', 'Draft')
      .select('application_id')
      .maybeSingle()
    if (updateError || !updatedRow) {
      const { error: removeError } = await supabase.storage.from(storageBucket).remove([data.path])
      setError(updateError ? getDatabaseErrorMessage(updateError) : 'The uploaded file path could not be saved to your draft.')
      if (removeError) setError((current) => `${current} The uploaded file could not be removed: ${getDatabaseErrorMessage(removeError)}`)
    } else {
      const previousPath = form[field]
      setForm((current) => ({ ...current, [field]: data.path }))
      if (previousPath && previousPath !== data.path) {
        const { error: removePreviousError } = await supabase.storage.from(storageBucket).remove([previousPath])
        if (removePreviousError) {
          setError(`The new file was saved, but the previous file could not be deleted: ${getDatabaseErrorMessage(removePreviousError)}`)
        }
      }
    }
    setUploading((current) => ({ ...current, [field]: false }))
  }

  const renderApplicationsPage = (
    <>
      <h1 id="inbound-heading">Your inbound applications</h1>
      <p>Enter the Nomination ID issued to you to start an application, or continue a saved draft.</p>
      <form className="outbound-new-application" onSubmit={beginWithNomination}>
        <InputField
          label="Nomination ID"
          name="nomination_id"
          value={nominationInput}
          onChange={(event) => {
            setNominationInput(event.target.value)
            setError('')
          }}
          inputMode="numeric"
          required
        />
        <button className="btn btn--primary" type="submit" disabled={openCycles.length === 0}>
          Start application
        </button>
      </form>
      {openCycles.length === 0 && <p>No exchange cycle is currently accepting applications.</p>}
      {applications.length > 0 ? (
        <div className="outbound-application-list">
          <h2 className="portal-section-heading">Your applications</h2>
          {applications.map((application) => {
            const cycle = cycles.find((item) => Number(item.id) === Number(application.semester_applied_for))
            return (
              <article className="outbound-application-list__item" key={application.application_id}>
                <div>
                  <h3>{cycle ? `${cycle.semester} ${cycle.academic_year}` : 'Exchange cycle'}</h3>
                  <p>Application #{application.application_id} · Nomination #{application.nomination_id}</p>
                </div>
                <span className={`outbound-application-list__status outbound-application-list__status--${application.application_status?.toLowerCase()}`}>
                  {application.application_status}
                </span>
                {application.application_status === 'Draft' && (
                  <button className="btn btn--secondary" type="button" onClick={() => openDraft(application.application_id)}>
                    Continue draft
                  </button>
                )}
                {application.application_status !== 'Draft' && (
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={() => navigate(`/portal/inbound-application/${application.application_id}/submitted`)}
                  >
                    View application
                  </button>
                )}
              </article>
            )
          })}
        </div>
      ) : <p className="outbound-application__empty">You do not have any applications yet.</p>}
      {applications.length > 0 && !applications.some((application) => application.application_status !== 'Draft') && (
        <p className="outbound-application__empty">No submitted application is available yet.</p>
      )}
      {error && <p className="outbound-application__error" role="alert">{error}</p>}
      <Link className="btn btn--secondary" to="/portal">Back to portal</Link>
    </>
  )

  const renderWizardPage = (pageIndex) => (
    <>
      <nav className="outbound-progress" aria-label="Application progress">
        {steps.map((item, index) => (
          <div className="outbound-progress__step" key={item.title} aria-current={pageIndex === index ? 'step' : undefined}>
            <span className="outbound-progress__label">
              <span className="outbound-progress__number">{String(index + 1).padStart(2, '0')}</span>
              <span className="outbound-progress__title"> · {item.title}</span>
            </span>
            <span className="outbound-progress__track" aria-hidden="true">
              <span
                className="outbound-progress__fill"
                style={{ '--outbound-progress': `${index < pageIndex ? 100 : index === pageIndex ? scrollProgress : 0}%` }}
              />
            </span>
          </div>
        ))}
      </nav>
      <form className="outbound-form" onSubmit={pageIndex === steps.length - 1 ? handleSubmit : handleNext} noValidate>
        <div ref={pageContentRef} className="outbound-form__scroll">
          <h1>{steps[pageIndex].title}</h1>
          <p>{steps[pageIndex].description}</p>
          {pageIndex === 0 && (
            <div className="outbound-form__grid">
              <InputField label="First name" name="first_name" value={form.first_name} onChange={updateField} required autoComplete="given-name" />
              <InputField label="Middle name" name="middle_name" value={form.middle_name} onChange={updateField} autoComplete="additional-name" />
              <InputField label="Last name" name="last_name" value={form.last_name} onChange={updateField} required autoComplete="family-name" />
              <SelectField label="Gender" name="gender" value={form.gender} onChange={updateField} required>
                <option value="">Select gender</option><option value="Female">Female</option><option value="Male">Male</option>
              </SelectField>
              <InputField
                label="Date of birth"
                name="birthdate"
                value={form.birthdate}
                onChange={updateField}
                type="date"
                max={todayValue()}
                error={birthdateError}
                required
              />
              <InputField label="Email" name="email" value={student?.student_email || ''} readOnly required />
              <div className="inbound-phone">
                <SelectField
                  label="Country code"
                  name="phone_country_code"
                  value={form.phone_country_code || ''}
                  onChange={updateField}
                >
                  <option value="">Code</option>
                  {phoneCountryCodes.map(({ country, code }) => (
                    <option key={`${country}-${code}`} value={code}>{country} ({code})</option>
                  ))}
                </SelectField>
                <InputField
                  label="Phone number"
                  name="phone_number"
                  value={form.phone_number}
                  onChange={updateField}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="Number without country code"
                />
              </div>
              <label className="outbound-form__checkbox outbound-form__checkbox--inline">
                <input type="checkbox" name="is_whatsapp_available" checked={form.is_whatsapp_available} onChange={updateField} />
                <span>This phone number is available on WhatsApp</span>
              </label>
              <SelectField label="Country of residence" name="country_of_residence" value={form.country_of_residence} onChange={updateField}>
                <option value="">Select a country</option>
                {countries.map((country) => (
                  <option key={country.id} value={country.name}>{country.name}</option>
                ))}
              </SelectField>
              <SelectField label="Nationality" name="nationality" value={form.nationality} onChange={updateField}>
                <option value="">Select a country</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
              </SelectField>
              <InputField label="Passport number" name="passport_number" value={form.passport_number} onChange={updateField} />
              <InputField label="Passport expiry date" name="passport_expiry_date" value={form.passport_expiry_date} onChange={updateField} type="date" />
              <SelectField label="Passport issuing country" name="passport_issuing_country" value={form.passport_issuing_country} onChange={updateField}>
                <option value="">Select a country</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
              </SelectField>
            </div>
          )}
          {pageIndex === 1 && (
            <div className="outbound-form__grid">
              <InputField label="Major or field of study" name="major" value={form.major} onChange={updateField} required />
              <SelectField label="Current year of study" name="current_year_of_study" value={form.current_year_of_study} onChange={updateField} required>
                <option value="">Select your year</option>
                {['Second year', 'Third year', 'Fourth year', 'Fifth year'].map((year) => <option key={year} value={year}>{year}</option>)}
              </SelectField>
              <InputField label="Current GPA" name="gpa" value={form.gpa} onChange={updateField} type="number" min="0" step="any" required />
              <div className="inbound-form__field-note">
                <InputField label="Maximum GPA" name="max_gpa" value={form.max_gpa} onChange={updateField} type="number" min="0" step="any" required />
                <p className="outbound-form__field-warning">Enter the highest GPA a student can earn at your educational institution.</p>
              </div>
              <InputField label="Credits passed" name="credits_passed" value={form.credits_passed} onChange={updateField} type="number" min="0" step="1" required />
              <div className="inbound-form__field-note">
                <InputField label="Maximum credits" name="max_credits" value={form.max_credits} onChange={updateField} type="number" min="0" step="1" required />
                <p className="outbound-form__field-warning">Enter the highest number of credits a student can earn at your educational institution.</p>
              </div>
              <InputField label="Expected graduation date" name="expected_graduation_date" value={form.expected_graduation_date} onChange={updateField} type="date" required />
              <FileField label="Academic transcript" name="transcript" value={form.transcript} onUpload={uploadFile} uploading={uploading} />
              <div className="inbound-form__field-note">
                <FileField label="English proficiency document" name="language_proficiency" value={form.language_proficiency} onUpload={uploadFile} uploading={uploading} />
                <article className="inbound-form__explanation">
                  Accepted evidence includes an IELTS or TOEFL result, or a testimony from your dean, vice dean, or an English department instructor confirming that your English proficiency is sufficient.
                </article>
              </div>
            </div>
          )}
          {pageIndex === 2 && (
            <div className="outbound-form__grid">
              <p className="outbound-form__section-heading">
                Nomination #{nomination?.id} · {nomination?.cycle?.semester} {nomination?.cycle?.academic_year}
              </p>
              <SelectField label="Exchange cycle associated with your nomination" name="semester_applied_for" value={form.semester_applied_for || ''} onChange={updateField} required>
                <option value={nomination?.semester || ''}>
                  {nomination?.cycle?.semester} {nomination?.cycle?.academic_year}
                </option>
              </SelectField>
              <p>Your cycle is linked to the active nomination.</p>
              <FileField label="Passport copy" name="passport_copy" value={form.passport_copy} onUpload={uploadFile} uploading={uploading} />
              <FileField label="Profile photo" name="profile_photo" value={form.profile_photo} onUpload={uploadFile} uploading={uploading} accept=".jpg,.jpeg,.png" />
            </div>
          )}
          {pageIndex === 3 && (
            <div className="outbound-form__terms">
              {terms.map((term, index) => (
                <label className="outbound-form__checkbox" key={term}>
                  <input
                    type="checkbox"
                    checked={acceptedTerms[index]}
                    onChange={() => setAcceptedTerms((current) => current.map((accepted, itemIndex) => itemIndex === index ? !accepted : accepted))}
                  />
                  <span>{term}</span>
                </label>
              ))}
            </div>
          )}
          {error && <p className="outbound-application__error" role="alert">{error}</p>}
        </div>
        <div className="outbound-form__actions">
          {draftSaveStatus && (
            <p className="outbound-application__message" role="status">
              {draftSaveStatus === 'pending' && 'Unsaved changes'}
              {draftSaveStatus === 'saving' && 'Saving changes…'}
              {draftSaveStatus === 'saved' && 'Saved'}
              {draftSaveStatus === 'error' && 'Changes could not be saved.'}
            </p>
          )}
          <button
            className="btn btn--secondary"
            type="button"
            onClick={() => handleBack(pageIndex)}
            disabled={saving}
          >
            {pageIndex === 0 ? 'Back to applications' : 'Back'}
          </button>
          <div className="outbound-form__actions-end">
            {pageIndex === steps.length - 1 ? (
              <button className="btn btn--primary" type="submit" disabled={!canSubmit || saving || Object.values(uploading).some(Boolean)}>
                {saving ? 'Submitting…' : 'Submit application'}
              </button>
            ) : (
              <button className="btn btn--primary" type="submit" disabled={saving || Object.values(uploading).some(Boolean)}>Next</button>
            )}
          </div>
        </div>
      </form>
    </>
  )

  if (loading) return <section className="portal-page"><div className="portal-card" role="status">Loading your inbound applications…</div></section>

  if (!student) {
    return (
      <section className="portal-page">
        <div className="portal-card">
          <span className="auth-card__eyebrow">Incoming student portal</span>
          <h1>Inbound application unavailable</h1>
          <p className="outbound-application__error" role="alert">{error}</p>
          <Link className="btn btn--secondary" to="/portal">Back to portal</Link>
        </div>
      </section>
    )
  }

  const visibleSubmittedApplication = String(submittedApplication?.application_id) === submittedRouteId
    ? submittedApplication
    : null
  const receiptIsLoading = receiptLoading || (!receiptError && !visibleSubmittedApplication)
  const renderSubmittedPage = visibleSubmittedApplication ? (
    <InboundApplicationReceipt
      application={visibleSubmittedApplication}
      studentId={student.student_id}
      countries={countries}
      cycles={cycles}
      universities={universities}
      onBack={() => navigate('/portal/inbound-application')}
      onRequestWithdrawal={requestWithdrawal}
      withdrawalState={withdrawalState}
      withdrawalReason={withdrawalReason}
      isConfirmingWithdrawal={isConfirmingWithdrawal}
      onWithdrawalReasonChange={(event) => setWithdrawalReason(event.target.value)}
      onCancelWithdrawal={() => {
        setIsConfirmingWithdrawal(false)
        setWithdrawalReason('')
        setWithdrawalState({ loading: false, error: '', message: '' })
      }}
    />
  ) : (
    <section className="outbound-receipt">
      <h1>{receiptIsLoading ? 'Loading application summary' : 'Application unavailable'}</h1>
      <p role={receiptIsLoading ? 'status' : 'alert'}>
        {receiptError || 'Loading your submitted application…'}
      </p>
      <button className="btn btn--secondary" type="button" onClick={() => navigate('/portal/inbound-application')}>Back to applications</button>
    </section>
  )

  return (
    <section
      ref={wizardScrollRef}
      className={`portal-page outbound-application${routeStep >= 0 ? ' outbound-application--wizard' : ''}${submittedRouteId ? ' outbound-application--receipt-page' : ''}`}
      aria-label={routeStep >= 0 ? 'Inbound application' : undefined}
      aria-labelledby={routeStep < 0 ? 'inbound-heading' : undefined}
    >
      <div className="portal-card portal-card--wide outbound-application__card">
        {routeStep < 0 && <span className="auth-card__eyebrow">Incoming student portal</span>}
        <Routes>
          <Route index element={renderApplicationsPage} />
          <Route path=":applicationId/submitted" element={renderSubmittedPage} />
          {steps.map((item, index) => (
            <Route key={`new-${item.path}`} path={`new/:nominationId/${item.path}`} element={renderWizardPage(index)} />
          ))}
          {steps.map((item, index) => (
            <Route key={`draft-${item.path}`} path={`:applicationId/${item.path}`} element={renderWizardPage(index)} />
          ))}
          <Route path="*" element={<Navigate to="/portal/inbound-application" replace />} />
        </Routes>
      </div>
    </section>
  )
}

export default InboundApplication
