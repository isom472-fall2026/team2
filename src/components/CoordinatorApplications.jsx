import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from '../supabase'
import { useAppStore } from '../stores/appStore'
import { formatUpdateTime } from '../formatUpdateTime'
import './CoordinatorApplications.css'
import './ApplicationUpdates.css'

const applicationEditors = {
  inbound: lazy(() => import('./InboundApplication').then((module) => ({ default: module.InboundApplicationEditor }))),
  outbound: lazy(() => import('./OutboundApplication').then((module) => ({ default: module.OutboundApplicationEditor }))),
}

const pageSize = 500

async function readAllRows(table) {
  const rows = []
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('application_id')
      .range(start, start + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return rows
  }
}

async function readProfiles(table, applications) {
  const studentIds = [...new Set(applications.map(({ student_id }) => student_id).filter(Boolean))]
  const profiles = []
  for (let index = 0; index < studentIds.length; index += 100) {
    const { data, error } = await supabase
      .from(table)
      .select('student_id, name, student_email')
      .in('student_id', studentIds.slice(index, index + 100))
    if (error) throw error
    profiles.push(...(data || []))
  }
  return new Map(profiles.map((profile) => [String(profile.student_id), profile]))
}

function getCycleLabel(application, cycles) {
  const cycle = cycles.find(({ id }) => Number(id) === Number(application.semester_applied_for))
  return cycle ? `${cycle.semester} ${cycle.academic_year}` : 'Cycle unavailable'
}

function compareCycles(left, right, cycles) {
  const leftCycle = cycles.find(({ id }) => Number(id) === Number(left.semester_applied_for))
  const rightCycle = cycles.find(({ id }) => Number(id) === Number(right.semester_applied_for))
  if (!leftCycle || !rightCycle) {
    return Number(left.semester_applied_for || 0) - Number(right.semester_applied_for || 0)
  }
  const yearOrder = leftCycle.academic_year.localeCompare(rightCycle.academic_year, undefined, { numeric: true })
  if (yearOrder !== 0) return yearOrder
  const semesterOrder = { Spring: 0, Fall: 1 }
  return semesterOrder[leftCycle.semester] - semesterOrder[rightCycle.semester]
}

function getStudentName(application, profiles) {
  const profile = profiles.get(String(application.student_id))
  return [application.first_name || profile?.name?.split(' ')[0], application.middle_name, application.last_name || profile?.name?.split(' ').slice(1).join(' ')]
    .filter(Boolean)
    .join(' ') || 'Name unavailable'
}

function getLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return 'Not provided'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function getApplicationFields(application, data) {
  const countryById = new Map(data.countries.map((country) => [String(country.id), country.name]))
  const universityById = new Map(data.universities.map((university) => [String(university.university_id), university.name]))
  const cycleById = new Map(data.cycles.map((cycle) => [String(cycle.id), `${cycle.semester} ${cycle.academic_year}`]))

  return Object.entries(application)
    .map(([key, value]) => {
      if (['nationality', 'passport_issuing_country'].includes(key) && value !== null) {
        return [getLabel(key), countryById.get(String(value)) || `Country #${value}`]
      }
      if (key === 'university_id' && value !== null) {
        return ['Destination university', universityById.get(String(value)) || `University #${value}`]
      }
      if (key === 'semester_applied_for' && value !== null) {
        return ['KU semester', cycleById.get(String(value)) || `Cycle #${value}`]
      }
      if (key === 'emergency_contact' && value !== null) {
        const contact = data.contacts.find(({ contact_id }) => Number(contact_id) === Number(value))
        return ['Emergency contact', contact
          ? [contact.name, contact.phone_number, contact.email].filter(Boolean).join(' · ')
          : `Contact #${value}`]
      }
      return [getLabel(key), formatValue(value)]
    })
}

// The same colours as the student receipt's printed badges (OutboundApplication.css).
const statusColors = {
  submitted: { border: [22, 128, 74], text: [8, 116, 67], fill: [232, 243, 237] },
  accepted: { border: [22, 128, 74], text: [8, 116, 67], fill: [232, 243, 237] },
  rejected: { border: [198, 40, 40], text: [180, 35, 24], fill: [249, 234, 234] },
  'in-review': { border: [183, 121, 31], text: [138, 87, 0], fill: [247, 241, 233] },
}
const neutralStatusColors = { border: [180, 190, 200], text: [70, 80, 90], fill: [244, 246, 248] }
const textColor = [17, 17, 17]
const mutedColor = [95, 110, 125]
const accentColor = [43, 170, 226]
const ruleColor = [214, 236, 246]

let logosPromise
function loadLogos() {
  const readAsDataUrl = async (fileName) => {
    const response = await fetch(`${import.meta.env.BASE_URL}images/${fileName}`)
    if (!response.ok) throw new Error(`Could not load ${fileName}`)
    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  }
  // A missing logo should not stop a coordinator from exporting the record itself.
  logosPromise ??= Promise.all([
    readAsDataUrl('kulogolightmode.png'),
    readAsDataUrl('exchangelogoeng.png'),
  ]).catch(() => {
    logosPromise = undefined
    return null
  })
  return logosPromise
}

async function downloadApplicationPdf(application, applicationType, data, coordinatorName) {
  const studentId = application.student_id || 'unknown'
  const cycle = getCycleLabel(application, data.cycles)
  const university = data.universities.find(
    ({ university_id }) => Number(university_id) === Number(application.university_id),
  )?.name || 'University unavailable'
  const logos = await loadLogos()
  const doc = new jsPDF({ format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16
  const contentWidth = pageWidth - margin * 2
  const labelWidth = contentWidth / 3
  const valueX = margin + labelWidth + 4
  const valueWidth = contentWidth - labelWidth - 4
  const lineHeight = (fontSize) => fontSize * 0.3528 * 1.35
  let cursorY = margin

  const ensureSpace = (height) => {
    if (cursorY + height > pageHeight - margin - 6) {
      doc.addPage()
      cursorY = margin
    }
  }

  const rule = () => {
    doc.setDrawColor(...ruleColor)
    doc.setLineWidth(0.3)
    doc.line(margin, cursorY, pageWidth - margin, cursorY)
  }

  const heading = (text, fontSize, gapAfter) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(fontSize)
    doc.setTextColor(...textColor)
    const wrapped = doc.splitTextToSize(text, contentWidth)
    ensureSpace(wrapped.length * lineHeight(fontSize) + gapAfter)
    doc.text(wrapped, margin, cursorY, { baseline: 'top' })
    cursorY += wrapped.length * lineHeight(fontSize) + gapAfter
  }

  const row = (label, value, statusBadge = false) => {
    const fontSize = 10
    doc.setFontSize(fontSize)
    doc.setFont('helvetica', 'bold')
    const labelLines = doc.splitTextToSize(label, labelWidth)
    doc.setFont('helvetica', statusBadge ? 'bold' : 'normal')
    const valueLines = statusBadge ? [value] : doc.splitTextToSize(String(value), valueWidth)
    const padding = 3.2
    const textHeight = Math.max(labelLines.length, valueLines.length) * lineHeight(fontSize)
    const rowHeight = textHeight + padding * 2 + (statusBadge ? 2 : 0)
    ensureSpace(rowHeight)
    const textY = cursorY + padding + (statusBadge ? 1 : 0)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...textColor)
    doc.text(labelLines, margin, textY, { baseline: 'top' })

    if (statusBadge) {
      const statusKey = String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const colors = statusColors[statusKey] || neutralStatusColors
      const badgeWidth = doc.getTextWidth(value) + 7
      const badgeHeight = lineHeight(fontSize) + 2.4
      doc.setFillColor(...colors.fill)
      doc.setDrawColor(...colors.border)
      doc.setLineWidth(0.3)
      doc.roundedRect(valueX, textY - 1.2, badgeWidth, badgeHeight, badgeHeight / 2, badgeHeight / 2, 'FD')
      doc.setTextColor(...colors.text)
      doc.text(String(value), valueX + 3.5, textY, { baseline: 'top' })
    } else {
      doc.setFont('helvetica', 'normal')
      doc.text(valueLines, valueX, textY, { baseline: 'top' })
    }

    cursorY += rowHeight
    rule()
  }

  if (logos) {
    const logoHeight = 18
    const [kuLogo, exchangeLogo] = logos.map((image) => {
      const { width, height } = doc.getImageProperties(image)
      return { image, width: Math.min((width / height) * logoHeight, contentWidth * 0.48) }
    })
    doc.addImage(kuLogo.image, 'PNG', margin, cursorY, kuLogo.width, logoHeight)
    doc.addImage(exchangeLogo.image, 'PNG', pageWidth - margin - exchangeLogo.width, cursorY, exchangeLogo.width, logoHeight)
    cursorY += logoHeight + 6
    rule()
    cursorY += 8
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...accentColor)
  doc.setCharSpace(0.4)
  doc.text(`${applicationType === 'inbound' ? 'Inbound' : 'Outbound'} application`.toUpperCase(), margin, cursorY, { baseline: 'top' })
  doc.setCharSpace(0)
  cursorY += 6

  heading(getStudentName(application, data.profiles[applicationType]), 20, 3)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...mutedColor)
  doc.text(`Exported by ${coordinatorName || 'KU coordinator'} on ${new Date().toLocaleDateString()}`, margin, cursorY, { baseline: 'top' })
  cursorY += 9
  rule()

  row('Student ID', studentId)
  row('Destination university', university)
  row('Cycle', cycle)
  row('Current status', application.application_status || 'Unknown', true)
  cursorY += 10

  heading('Application summary', 15, 3)
  rule()
  getApplicationFields(application, data).forEach(([label, value]) => row(label, value))

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...mutedColor)
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
  }

  const safeCycle = cycle.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '')
  doc.save(`${studentId}-${safeCycle || 'cycle'}.pdf`)
}

const decidableStatuses = ['Submitted', 'In Review', 'Pending Interview']

// Shown to the coordinator only; the database's default_decision_update() holds the wording
// that is actually saved, so the two must be changed together.
const defaultDecisionUpdates = {
  accept: 'Congratulations on being accepted! You will receive an acceptance letter shortly.',
  reject: 'You currently do not meet one of the general requirements for the student exchange program at KU. We encourage you to apply later.',
}

// Draft is left out by the story, and Modified because those rows are earlier versions of an
// edited application that the list never shows.
const statusFilterOptions = [
  'Submitted', 'In Review', 'Pending Interview', 'Accepted', 'Approved',
  'Rejected', 'Ineligible', 'Withdrawal Requested', 'Withdrawn',
]
const gpaBoundPattern = /^(\d+(\.\d*)?|\.\d+)$/
const emptyGpaInput = { min: '', max: '' }
const noGpaBounds = { min: null, max: null }

function getGpaScale(application) {
  return application.type === 'inbound' ? Number(application.max_gpa) || null : 4
}

// Incoming students report GPA on their home university's scale, so it is brought to KU's 4.0
// scale before it is filtered or sorted against KU students' GPAs. It is rounded the way the
// Manage page shows it, so a bound matches the number the coordinator reads.
function getGpaOnFourScale(application) {
  if (application.gpa === null || application.gpa === undefined || application.gpa === '') return null
  const gpa = Number(application.gpa)
  const scale = getGpaScale(application)
  if (!Number.isFinite(gpa) || !scale) return null
  return scale === 4 ? gpa : Math.round((gpa / scale) * 400) / 100
}

function formatGpa(application) {
  const gpaOnFourScale = getGpaOnFourScale(application)
  if (gpaOnFourScale === null) return 'Not provided'
  if (application.type !== 'inbound') return String(application.gpa)
  const scale = getGpaScale(application)
  return `${application.gpa} of ${scale}${scale === 4 ? '' : ` (${gpaOnFourScale.toFixed(2)} on 4.0)`}`
}

function parseGpaBound(value, label) {
  const text = value.trim()
  if (!text) return { value: null }
  if (!gpaBoundPattern.test(text) || Number(text) > 4) {
    return { error: `${label} GPA must be a number from 0.0 to 4.0.` }
  }
  return { value: Number(text) }
}

function readGpaBounds(input) {
  const min = parseGpaBound(input.min, 'Minimum')
  const max = parseGpaBound(input.max, 'Maximum')
  if (min.error || max.error) return { error: min.error || max.error }
  if (min.value !== null && max.value !== null && min.value > max.value) {
    return { error: 'The minimum GPA cannot be above the maximum GPA.' }
  }
  return { bounds: { min: min.value, max: max.value } }
}

function ApplicationList({ applications, profiles, cycles, universities, countries, contacts, onManage, onExport, loading, emptyMessage }) {
  if (loading) return <p role="status">Loading applications...</p>
  if (applications.length === 0) return <div className="portal-empty-state">{emptyMessage}</div>

  return (
    <div className="nomination-table-wrap">
      <table className="nomination-table coordinator-applications__table">
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Student ID</th>
            <th scope="col">Destination university</th>
            <th scope="col">Nationality</th>
            <th scope="col">Travel semester</th>
            <th scope="col">GPA</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((application) => {
            const profilesByType = profiles[application.type]
            const studentName = getStudentName(application, profilesByType)
            const nationality = countries.find(({ id }) => Number(id) === Number(application.nationality))?.name
            const university = universities.find(({ university_id }) => Number(university_id) === Number(application.university_id))?.name
            return (
              <tr key={`${application.type}-${application.application_id}`}>
                <th scope="row">{studentName}</th>
                <td>{application.student_id || 'Unavailable'}</td>
                <td>{university || 'Unavailable'}</td>
                <td>{nationality || 'Unavailable'}</td>
                <td>{getCycleLabel(application, cycles)}</td>
                <td>{formatGpa(application)}</td>
                <td>{application.application_status}</td>
                <td>
                  <div className="nomination-table__actions">
                    <button className="btn btn--secondary" type="button" onClick={() => onManage(application)}>
                      Manage
                    </button>
                    <button className="btn btn--secondary" type="button" onClick={() => onExport(application)}>
                      Export PDF
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function CoordinatorApplications() {
  const coordinatorName = useAppStore((state) => state.profile?.name)
  const navigate = useNavigate()
  const returnState = useLocation().state
  const [data, setData] = useState({
    inbound: [],
    outbound: [],
    inboundProfiles: new Map(),
    outboundProfiles: new Map(),
    cycles: [],
    universities: [],
    countries: [],
    contacts: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [now, setNow] = useState(null)
  const [error, setError] = useState('')
  const [section, setSection] = useState(returnState?.applicationsSection === 'history' ? 'history' : 'current')
  const [applicationType, setApplicationType] = useState(returnState?.applicationType === 'inbound' ? 'inbound' : 'outbound')
  const [search, setSearch] = useState('')
  const [nationalityFilter, setNationalityFilter] = useState('')
  const [universityFilter, setUniversityFilter] = useState('')
  const [semesterOrder, setSemesterOrder] = useState('descending')
  const [statusFilter, setStatusFilter] = useState('')
  const [gpaInput, setGpaInput] = useState(emptyGpaInput)
  const [gpaBounds, setGpaBounds] = useState(noGpaBounds)
  const [gpaError, setGpaError] = useState('')
  const [currentOrder, setCurrentOrder] = useState('name')
  const [exportError, setExportError] = useState('')
  const sectionRef = useRef(null)

  useEffect(() => {
    let isCurrent = true
    const loadApplications = async () => {
      try {
        const [inbound, outbound, cyclesResult, universitiesResult, countriesResult, contactsResult] = await Promise.all([
          readAllRows('inboundapplication'),
          readAllRows('outboundapplication'),
          supabase.from('exchange_cycle').select('*').order('id'),
          supabase.from('partneruniversity').select('university_id, name').order('name'),
          supabase.from('country').select('id, name').order('name'),
          supabase.from('emergency_contact').select('*'),
        ])
        for (const result of [cyclesResult, universitiesResult, countriesResult, contactsResult]) {
          if (result.error) throw result.error
        }
        const [inboundProfiles, outboundProfiles] = await Promise.all([
          readProfiles('incomingstudentauth', inbound),
          readProfiles('kustudentauth', outbound),
        ])
        if (!isCurrent) return
        setData({
          inbound,
          outbound,
          inboundProfiles,
          outboundProfiles,
          cycles: cyclesResult.data || [],
          universities: universitiesResult.data || [],
          countries: countriesResult.data || [],
          contacts: contactsResult.data || [],
        })
        setNow(Date.now())
      } catch (loadError) {
        if (isCurrent) setError(loadError.message || 'Applications could not be loaded.')
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    loadApplications()
    return () => {
      isCurrent = false
    }
  }, [])

  const currentCycle = useMemo(() => {
    if (now === null) return null
    const openCycle = data.cycles
      .filter((cycle) => cycle.application_o && cycle.application_c
        && new Date(cycle.application_o).getTime() <= now
        && new Date(cycle.application_c).getTime() >= now)
      .sort((left, right) => new Date(right.application_o) - new Date(left.application_o))[0]
    if (openCycle) return openCycle
    // Between application windows, coordinators are still reviewing the semester that has not
    // started yet, so it stays the current table instead of dropping into the history.
    return data.cycles
      .filter((cycle) => cycle.cycle_start && new Date(cycle.cycle_start).getTime() > now)
      .sort((left, right) => new Date(left.cycle_start) - new Date(right.cycle_start))[0] || null
  }, [data.cycles, now])

  const profiles = {
    inbound: data.inboundProfiles,
    outbound: data.outboundProfiles,
  }
  // Modified rows are earlier versions of an edited application; they are shown as its
  // history on the Manage page, not as applications of their own.
  const records = data[applicationType]
    .filter((application) => application.application_status !== 'Modified')
    .map((application) => ({ ...application, type: applicationType }))
  const currentApplications = records.filter(
    (application) => currentCycle && Number(application.semester_applied_for) === Number(currentCycle.id),
  )
  const historicalApplications = records.filter(
    (application) => application.application_status === 'Approved'
      && (!currentCycle || Number(application.semester_applied_for) !== Number(currentCycle.id)),
  )

  const isHistory = section === 'history'
  const byStudentName = (left, right) => getStudentName(left, profiles[applicationType])
    .localeCompare(getStudentName(right, profiles[applicationType]))
  const byGpaHighestFirst = (left, right) => {
    const leftGpa = getGpaOnFourScale(left)
    const rightGpa = getGpaOnFourScale(right)
    if (leftGpa === rightGpa) return byStudentName(left, right)
    if (leftGpa === null) return 1
    if (rightGpa === null) return -1
    return rightGpa - leftGpa
  }
  const isInGpaRange = (application) => {
    if (gpaBounds.min === null && gpaBounds.max === null) return true
    const gpa = getGpaOnFourScale(application)
    return gpa !== null
      && (gpaBounds.min === null || gpa >= gpaBounds.min)
      && (gpaBounds.max === null || gpa <= gpaBounds.max)
  }
  const hasCurrentFilters = Boolean(statusFilter) || gpaBounds.min !== null || gpaBounds.max !== null
  const visibleApplications = isHistory
    ? historicalApplications
      .filter((application) => {
        const name = getStudentName(application, profiles[applicationType]).toLowerCase()
        const studentId = String(application.student_id || '')
        const query = search.trim().toLowerCase()
        return (!query || name.includes(query) || studentId.includes(query))
          && (!nationalityFilter || String(application.nationality) === nationalityFilter)
          && (!universityFilter || String(application.university_id) === universityFilter)
      })
      .sort((left, right) => {
        const cycleSort = compareCycles(left, right, data.cycles)
        if (cycleSort !== 0) return semesterOrder === 'ascending' ? cycleSort : -cycleSort
        return byStudentName(left, right)
      })
    : currentApplications
      .filter((application) => (!statusFilter || application.application_status === statusFilter) && isInGpaRange(application))
      .sort(currentOrder === 'gpa' ? byGpaHighestFirst : byStudentName)

  // An invalid bound keeps the last valid GPA filter in place, so the list never changes to
  // match numbers the coordinator is told are wrong.
  const changeGpaBound = (bound, value) => {
    const nextInput = { ...gpaInput, [bound]: value }
    setGpaInput(nextInput)
    const { bounds, error: boundsError } = readGpaBounds(nextInput)
    if (boundsError) {
      setGpaError(`${boundsError} The GPA filter was not changed.`)
      return
    }
    setGpaError('')
    setGpaBounds(bounds)
  }

  const clearFilters = () => {
    setStatusFilter('')
    setGpaInput(emptyGpaInput)
    setGpaBounds(noGpaBounds)
    setGpaError('')
  }

  const showSection = (nextSection) => {
    setSection(nextSection)
    sectionRef.current?.scrollIntoView({ block: 'start' })
  }

  const manageApplication = (application) => {
    // Recording where the coordinator was on the portal entry itself means the browser's
    // back button returns to this table, not to the portal's default view.
    navigate('/portal', {
      replace: true,
      state: { view: 'applications', applicationsSection: section, applicationType },
    })
    navigate(`/portal/applications/${application.type}/${application.application_id}`)
  }

  const exportPdf = async (application) => {
    try {
      setExportError('')
      await downloadApplicationPdf(
        application,
        applicationType,
        { ...data, profiles },
        coordinatorName,
      )
    } catch (exportFailure) {
      setExportError(exportFailure.message || 'The application PDF could not be exported.')
    }
  }

  return (
    <section ref={sectionRef} className="coordinator-applications" aria-labelledby="portal-heading">
      <span className="auth-card__eyebrow">Application records</span>
      {isHistory ? (
        <>
          <h2 id="portal-heading">Historical applications</h2>
          <p>Approved applications from previous KU semesters.</p>
          <div className="coordinator-applications__history-link">
            <button className="btn btn--secondary" type="button" onClick={() => showSection('current')}>
              Back to current applications
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 id="portal-heading">Current semester applications</h2>
          <p>Review applications for the current or upcoming KU semester, including drafts.</p>
          <p className="coordinator-applications__cycle">
            {currentCycle ? `KU semester: ${currentCycle.semester} ${currentCycle.academic_year}` : 'There is no current or upcoming KU semester.'}
          </p>
        </>
      )}
      <div className="coordinator-applications__type-tabs" role="group" aria-label="Application type">
        <button className={applicationType === 'outbound' ? 'btn btn--primary' : 'btn btn--secondary'} type="button" onClick={() => setApplicationType('outbound')}>
          Outbound
        </button>
        <button className={applicationType === 'inbound' ? 'btn btn--primary' : 'btn btn--secondary'} type="button" onClick={() => setApplicationType('inbound')}>
          Inbound
        </button>
      </div>
      {isHistory && <div className="coordinator-applications__filters">
        <label>
          Search by student {applicationType === 'outbound' ? 'name or ID' : 'name'}
          <input value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label>
          Nationality
          <select value={nationalityFilter} onChange={(event) => setNationalityFilter(event.target.value)}>
            <option value="">All nationalities</option>
            {data.countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
          </select>
        </label>
        <label>
          Partner university
          <select value={universityFilter} onChange={(event) => setUniversityFilter(event.target.value)}>
            <option value="">All universities</option>
            {data.universities.map((university) => <option key={university.university_id} value={university.university_id}>{university.name}</option>)}
          </select>
        </label>
        <label>
          Semester order
          <select value={semesterOrder} onChange={(event) => setSemesterOrder(event.target.value)}>
            <option value="descending">Newest first</option>
            <option value="ascending">Oldest first</option>
          </select>
        </label>
      </div>}
      {!isHistory && (
        <>
          <div className="coordinator-applications__filters" role="group" aria-label="Filter applications">
            <label>
              Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">All statuses</option>
                {statusFilterOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>
              Minimum GPA
              <input inputMode="decimal" placeholder="0.0" value={gpaInput.min} onChange={(event) => changeGpaBound('min', event.target.value)} />
            </label>
            <label>
              Maximum GPA
              <input inputMode="decimal" placeholder="4.0" value={gpaInput.max} onChange={(event) => changeGpaBound('max', event.target.value)} />
            </label>
            <label>
              Sort by
              <select value={currentOrder} onChange={(event) => setCurrentOrder(event.target.value)}>
                <option value="name">Student name</option>
                <option value="gpa">GPA, highest first</option>
              </select>
            </label>
            <button className="btn btn--secondary coordinator-applications__clear" type="button" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
          {applicationType === 'inbound' && (
            <p className="coordinator-applications__cycle">Inbound GPAs are compared on KU&apos;s 4.0 scale.</p>
          )}
          {gpaError && <p className="auth-form__error" role="alert">{gpaError}</p>}
        </>
      )}
      {error && <p className="auth-form__error" role="alert">{error}</p>}
      {exportError && <p className="auth-form__error" role="alert">{exportError}</p>}
      <p className="coordinator-applications__count" aria-live="polite">
        {!isHistory && hasCurrentFilters
          ? `${visibleApplications.length} of ${currentApplications.length} application(s) match the filters`
          : `${visibleApplications.length} application(s)`}
      </p>
      <ApplicationList
        applications={visibleApplications}
        profiles={profiles}
        cycles={data.cycles}
        universities={data.universities}
        countries={data.countries}
        contacts={data.contacts}
        onExport={exportPdf}
        onManage={manageApplication}
        loading={isLoading}
        emptyMessage={isHistory
          ? 'No approved applications from previous cycles match these filters.'
          : hasCurrentFilters && currentApplications.length > 0
            ? 'No applications for this KU semester match these filters.'
            : 'There are no applications for this KU semester yet.'}
      />
      {!isHistory && (
        <div className="coordinator-applications__history-link">
          <button className="btn btn--secondary" type="button" onClick={() => showSection('history')}>
            Historical applications
          </button>
        </div>
      )}
    </section>
  )
}

const reviewTypes = {
  outbound: {
    label: 'outbound',
    table: 'outboundapplication',
    bucket: 'outbound-application-files',
    profileTable: 'kustudentauth',
    reviewFunction: 'review_outbound_application',
    updateColumn: 'outbound_application_id',
    attachments: [
      ['civil_id_copy', 'Civil ID copy'],
      ['passport_copy', 'Passport copy'],
      ['transcript', 'Academic transcript'],
    ],
  },
  inbound: {
    label: 'inbound',
    table: 'inboundapplication',
    bucket: 'inbound-application-files',
    profileTable: 'incomingstudentauth',
    reviewFunction: 'review_inbound_application',
    updateColumn: 'inbound_application_id',
    attachments: [
      ['passport_copy', 'Passport copy'],
      ['transcript', 'Academic transcript'],
    ],
  },
}

function useApplicationUpdates(type, applicationId, refreshKey) {
  const requestKey = `${type}-${applicationId}-${refreshKey}`
  const [state, setState] = useState({ key: null, updates: [], error: '' })
  useEffect(() => {
    if (!applicationId) return undefined
    let isCurrent = true
    supabase
      .from('updates')
      .select('id, details, created_at')
      .eq(reviewTypes[type].updateColumn, applicationId)
      .order('created_at', { ascending: false })
      .then(({ data: rows, error: readError }) => {
        if (!isCurrent) return
        setState(readError
          ? { key: requestKey, updates: [], error: readError.message || 'The updates could not be loaded.' }
          : { key: requestKey, updates: rows || [], error: '' })
      })
    return () => {
      isCurrent = false
    }
  }, [type, applicationId, requestKey])
  // A result from a previous application or before the latest send counts as still loading.
  return state.key === requestKey
    ? { loading: false, updates: state.updates, error: state.error }
    : { loading: true, updates: [], error: '' }
}

function UpdateHistory({ type, applicationId, refreshKey, headingId }) {
  const { loading, updates, error } = useApplicationUpdates(type, applicationId, refreshKey)
  return (
    <section className="coordinator-review__panel" aria-labelledby={headingId}>
      <h2 id={headingId}>Update history</h2>
      {loading && <p role="status">Loading updates...</p>}
      {error && <p className="auth-form__error" role="alert">{error}</p>}
      {!loading && !error && updates.length === 0 && <p>No updates have been sent on this application yet.</p>}
      {updates.length > 0 && (
        <ol className="update-history">
          {updates.map((update) => (
            <li key={update.id}>
              <time dateTime={update.created_at}>{formatUpdateTime(update.created_at)}</time>
              <p>{update.details}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// The statuses offer_outbound_alternatives() accepts.
const offerableStatuses = ['Submitted', 'Pending Interview']
const idleOfferAction = { loading: false, error: '', message: '' }

function AlternativeOffers({ application, universities }) {
  const [state, setState] = useState({ key: null, offers: [], error: '' })
  const [refresh, setRefresh] = useState(0)
  const [isComposing, setIsComposing] = useState(false)
  const [selected, setSelected] = useState([])
  const [note, setNote] = useState('')
  const [action, setAction] = useState(idleOfferAction)
  const applicationId = application.application_id
  // Accepting an offer changes the application's university, which reaches this page live, so
  // the offers are read again when it changes.
  const requestKey = `${applicationId}-${application.university_id}-${refresh}`

  useEffect(() => {
    let isCurrent = true
    supabase
      .from('outbound_offers')
      .select('id, university_id, note, offer_status, created_at, status_updated_at')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .then(({ data: rows, error: readError }) => {
        if (!isCurrent) return
        setState(readError
          ? { key: requestKey, offers: [], error: readError.message || 'The offers could not be loaded.' }
          : { key: requestKey, offers: rows || [], error: '' })
      })
    return () => {
      isCurrent = false
    }
  }, [applicationId, requestKey])

  const canOffer = offerableStatuses.includes(application.application_status)
  const universityName = (id) => universities.find((university) => Number(university.university_id) === Number(id))?.name || `University #${id}`
  const pendingUniversityIds = state.offers
    .filter((offer) => offer.offer_status === 'Pending')
    .map((offer) => Number(offer.university_id))
  // Kuwait University (4) is the home university, so it is never offered as a destination.
  const choices = universities.filter((university) => university.available !== false
    && Number(university.university_id) !== 4
    && Number(university.university_id) !== Number(application.university_id)
    && !pendingUniversityIds.includes(Number(university.university_id)))

  const toggleUniversity = (id) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  const closeComposer = () => {
    setIsComposing(false)
    setSelected([])
    setNote('')
  }

  const sendOffers = async (event) => {
    event.preventDefault()
    if (selected.length === 0) {
      setAction({ loading: false, error: 'Select at least one partner university to offer.', message: '' })
      return
    }
    setAction({ loading: true, error: '', message: '' })
    const { data: rows, error: offerError } = await supabase.rpc('offer_outbound_alternatives', {
      requested_application_id: applicationId,
      requested_university_ids: selected,
      // The note is sent exactly as typed; a note with no text at all means no note.
      requested_note: note.trim() ? note : null,
    })
    if (offerError) {
      setAction({ loading: false, error: offerError.message || 'The offers could not be sent.', message: '' })
      return
    }
    closeComposer()
    setRefresh((count) => count + 1)
    const count = rows?.length ?? selected.length
    setAction({ loading: false, error: '', message: `${count} ${count === 1 ? 'offer was' : 'offers were'} sent to the student.` })
  }

  const withdrawOffer = async (offerId) => {
    setAction({ loading: true, error: '', message: '' })
    const { error: withdrawError } = await supabase.rpc('withdraw_outbound_offer', { requested_offer_id: offerId })
    if (withdrawError) {
      setAction({ loading: false, error: withdrawError.message || 'The offer could not be withdrawn.', message: '' })
      return
    }
    setRefresh((count) => count + 1)
    setAction({ loading: false, error: '', message: 'The offer was withdrawn.' })
  }

  return (
    <section className="coordinator-review__panel" aria-labelledby="review-offers-heading">
      <h2 id="review-offers-heading">Alternative offers</h2>
      {!canOffer && <p>Alternatives can only be offered while the application is Submitted or Pending Interview.</p>}
      {canOffer && !isComposing && (
        <div className="nomination-table__actions">
          <button className="btn btn--primary" type="button" onClick={() => {
            setIsComposing(true)
            setAction(idleOfferAction)
          }}>
            Offer alternatives
          </button>
        </div>
      )}
      {canOffer && isComposing && (
        <form className="offer-composer" onSubmit={sendOffers} noValidate>
          <fieldset className="offer-composer__choices" disabled={action.loading}>
            <legend>Partner universities to offer</legend>
            {choices.length === 0 && <p>No other partner university is available to offer.</p>}
            {choices.map((university) => {
              const id = Number(university.university_id)
              return (
                <label key={id} className="offer-composer__choice">
                  <input type="checkbox" checked={selected.includes(id)} onChange={() => toggleUniversity(id)} />
                  {university.name}
                </label>
              )
            })}
          </fieldset>
          <label className="update-composer__field">
            Note for the student <span>(optional)</span>
            <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} disabled={action.loading} />
          </label>
          <div className="nomination-table__actions">
            <button className="btn btn--primary" type="submit" disabled={action.loading}>
              {action.loading ? 'Sending…' : 'Send offers'}
            </button>
            <button className="btn btn--secondary" type="button" onClick={() => {
              closeComposer()
              setAction(idleOfferAction)
            }} disabled={action.loading}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {action.error && <p className="auth-form__error" role="alert">{action.error}</p>}
      {action.message && <p className="coordinator-review__message" role="status">{action.message}</p>}
      {state.key === null && <p role="status">Loading offers...</p>}
      {state.error && <p className="auth-form__error" role="alert">{state.error}</p>}
      {state.key !== null && !state.error && state.offers.length === 0 && <p>No alternatives have been offered on this application.</p>}
      {state.offers.length > 0 && (
        <ol className="update-history">
          {state.offers.map((offer) => (
            <li key={offer.id} className="offer-history__item">
              <div className="offer-history__heading">
                <strong className="update-history__application">{universityName(offer.university_id)}</strong>
                <span className={`coordinator-review__badge coordinator-review__badge--${offer.offer_status.toLowerCase()}`}>
                  {offer.offer_status}
                </span>
              </div>
              <time dateTime={offer.created_at}>Offered {formatUpdateTime(offer.created_at)}</time>
              {offer.note && <p>{offer.note}</p>}
              {offer.offer_status === 'Pending' && (
                <button className="btn btn--secondary" type="button" onClick={() => withdrawOffer(offer.id)} disabled={action.loading}>
                  Withdraw offer
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// The same fields modify_inbound_application() and modify_outbound_application() let an edit change.
const editableFields = {
  inbound: [
    'first_name', 'middle_name', 'last_name', 'gender', 'birthdate',
    'country_of_residence', 'nationality', 'passport_issuing_country',
    'passport_number', 'passport_expiry_date', 'phone_number', 'is_whatsapp_available',
    'major', 'current_year_of_study', 'gpa', 'max_gpa', 'credits_passed', 'max_credits',
    'expected_graduation_date', 'passport_copy', 'transcript', 'profile_photo',
  ],
  outbound: [
    'first_name', 'middle_name', 'last_name', 'gender', 'birthdate',
    'nationality', 'passport_issuing_country', 'passport_number', 'passport_expiry_date',
    'civil_id_number', 'civil_id_expiry', 'phone_number', 'is_whatsapp_available',
    'major', 'current_year_of_study', 'gpa', 'credits_passed', 'expected_graduation_semester',
    'university_id', 'semester_applied_for', 'civil_id_copy', 'passport_copy', 'transcript', 'profile_photo',
  ],
}

function ModificationHistory({ type, application, refreshKey }) {
  const navigate = useNavigate()
  const rootId = application.original_application_id ?? application.application_id
  const [state, setState] = useState({ key: null, versions: [], error: '' })
  const requestKey = `${rootId}-${application.application_id}-${refreshKey}`

  useEffect(() => {
    let isCurrent = true
    supabase
      .from(reviewTypes[type].table)
      .select('*')
      .or(`application_id.eq.${rootId},original_application_id.eq.${rootId}`)
      .then(({ data: rows, error: readError }) => {
        if (!isCurrent) return
        setState(readError
          ? { key: requestKey, versions: [], error: readError.message || 'The modification history could not be loaded.' }
          : { key: requestKey, versions: rows || [], error: '' })
      })
    return () => {
      isCurrent = false
    }
  }, [type, rootId, requestKey])

  const loading = state.key !== requestKey
  // Each old version was replaced at its status_updated_at, so that orders them; the current
  // version is always last.
  const versions = [...state.versions].sort((left, right) => {
    if (left.application_status === 'Modified' && right.application_status !== 'Modified') return -1
    if (right.application_status === 'Modified' && left.application_status !== 'Modified') return 1
    return new Date(left.status_updated_at) - new Date(right.status_updated_at)
  })
  const oldVersions = versions
    .map((version, index) => ({
      version,
      changed: versions[index + 1]
        ? editableFields[type].filter((field) => String(version[field] ?? '') !== String(versions[index + 1][field] ?? ''))
        : [],
    }))
    .filter(({ version }) => version.application_status === 'Modified')
    .reverse()
  const currentVersion = versions.find((version) => version.application_status !== 'Modified')

  if (!loading && !state.error && oldVersions.length === 0) return null

  const openVersion = (applicationId) => navigate(`/portal/applications/${type}/${applicationId}`)

  return (
    <section className="coordinator-review__panel" aria-labelledby="review-modifications-heading">
      <h2 id="review-modifications-heading">Modification history</h2>
      {application.application_status === 'Modified' && currentVersion && (
        <p>
          This is an earlier version. The application was edited and replaced.{' '}
          <button className="btn btn--secondary" type="button" onClick={() => openVersion(currentVersion.application_id)}>
            Open the current version
          </button>
        </p>
      )}
      {loading && <p role="status">Loading modification history...</p>}
      {state.error && <p className="auth-form__error" role="alert">{state.error}</p>}
      {oldVersions.length > 0 && (
        <ol className="update-history">
          {oldVersions.map(({ version, changed }) => (
            <li key={version.application_id}>
              <strong className="update-history__application">Version #{version.application_id}</strong>
              <time dateTime={version.status_updated_at}>Replaced {formatUpdateTime(version.status_updated_at)}</time>
              <p>{changed.length > 0 ? `Changed: ${changed.map(getLabel).join(', ')}` : 'Saved without changes to the details.'}</p>
              {String(version.application_id) !== String(application.application_id) && (
                <button className="btn btn--secondary" type="button" onClick={() => openVersion(version.application_id)}>
                  View this version
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// Dates are stored as calendar days; parsing them as UTC would shift them by a day in Kuwait.
function parseCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''))
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function addCalendarMonths(date, count) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + count + 1, 0).getDate()
  return new Date(date.getFullYear(), date.getMonth() + count, Math.min(date.getDate(), lastDay))
}

// Whole months are counted first and clamped to the month's end (31 January plus one month is
// 28 February), so short months never leave a negative day count.
function calendarDifference(from, to) {
  let totalMonths = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth()
  if (addCalendarMonths(from, totalMonths) > to) totalMonths -= 1
  const days = Math.round((to - addCalendarMonths(from, totalMonths)) / 86400000)
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, days }
}

function formatCalendarDifference({ years, months, days }) {
  const plural = (count, unit) => `${count} ${unit}${count === 1 ? '' : 's'}`
  return [plural(years, 'year'), plural(months, 'month'), plural(days, 'day')].join(', ')
}

function getTimeUntil(value, today) {
  const date = parseCalendarDate(value)
  if (!date) return null
  const expired = date < today
  return {
    date,
    expired,
    text: formatCalendarDifference(expired ? calendarDifference(date, today) : calendarDifference(today, date)),
    days: Math.round((date - today) / 86400000),
  }
}

const outstandingGpa = 3.67

function ApplicationMetrics({ application, type }) {
  const today = startOfToday()
  const passport = getTimeUntil(application.passport_expiry_date, today)
  const civilId = type === 'outbound' ? getTimeUntil(application.civil_id_expiry, today) : null
  const birthdate = parseCalendarDate(application.birthdate)
  const age = birthdate ? calendarDifference(birthdate, today).years : null
  const gpa = application.gpa === null || application.gpa === undefined || application.gpa === '' ? null : Number(application.gpa)
  // Incoming students report GPA on their home university's scale, so it is brought to KU's
  // 4.0 scale before comparing it with the outstanding-student mark.
  const maxGpa = type === 'inbound' ? Number(application.max_gpa) || null : 4
  const gpaOnFourScale = gpa !== null && maxGpa ? (gpa / maxGpa) * 4 : null
  const isOutstanding = gpaOnFourScale !== null && gpaOnFourScale > outstandingGpa

  return (
    <aside className="coordinator-review__metrics" aria-labelledby="review-metrics-heading">
      <h2 id="review-metrics-heading">Key metrics</h2>

      <div className={`coordinator-review__metric${passport?.expired ? ' coordinator-review__metric--alert' : ''}`}>
        <span className="coordinator-review__metric-label">Passport expiry</span>
        {passport ? (
          <>
            <strong>{passport.expired ? 'Expired' : passport.text}</strong>
            <span>{passport.expired ? `${passport.text} ago` : 'left'} · {passport.date.toLocaleDateString()}</span>
          </>
        ) : <strong>Not provided</strong>}
      </div>

      {type === 'outbound' && (
        <div className={`coordinator-review__metric${civilId?.expired ? ' coordinator-review__metric--alert' : ''}`}>
          <span className="coordinator-review__metric-label">Civil ID expiry</span>
          {civilId ? (
            <>
              <strong>{civilId.expired ? 'Expired' : `${civilId.days} day${civilId.days === 1 ? '' : 's'}`}</strong>
              <span>{civilId.expired ? `${Math.abs(civilId.days)} days ago` : 'left'} · {civilId.date.toLocaleDateString()}</span>
            </>
          ) : <strong>Not provided</strong>}
        </div>
      )}

      <div className={`coordinator-review__metric${age !== null && age < 18 ? ' coordinator-review__metric--alert' : ''}`}>
        <span className="coordinator-review__metric-label">18 or older</span>
        {age !== null ? (
          <>
            <strong>{age >= 18 ? 'Yes' : 'No'}</strong>
            <span>{age} years old</span>
          </>
        ) : <strong>Not provided</strong>}
      </div>

      <div className={`coordinator-review__metric${isOutstanding ? ' coordinator-review__metric--good' : ''}`}>
        <span className="coordinator-review__metric-label">Outstanding student</span>
        {gpaOnFourScale !== null ? (
          <>
            <strong>{isOutstanding ? 'Yes' : 'No'}</strong>
            <span>
              GPA {gpa}{type === 'inbound' ? ` of ${maxGpa}` : ''}
              {type === 'inbound' && maxGpa !== 4 ? ` (${gpaOnFourScale.toFixed(2)} on 4.0)` : ''}
              {` · above ${outstandingGpa} needed`}
            </span>
          </>
        ) : <strong>Not provided</strong>}
      </div>
    </aside>
  )
}

function storedFileName(path) {
  const fileName = String(path ?? '').split('/').pop() || ''
  return fileName.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '')
}

async function loadAttachmentPages(bucket, path, label) {
  const storage = supabase.storage.from(bucket)
  const fileName = storedFileName(path)
  const { data: signed, error: signError } = await storage.createSignedUrl(path, 3600)
  if (signError) throw signError

  if (!/\.pdf$/i.test(fileName)) {
    return [{ key: path, label, fileName, previewUrl: signed.signedUrl, openUrl: signed.signedUrl, pageNumber: null, pageCount: null }]
  }

  // A browser cannot show a PDF inside an <img>, so each page is drawn to a canvas, the same
  // way the student's receipt shows it.
  const { data: fileData, error: fileError } = await storage.download(path)
  if (fileError) throw fileError
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await fileData.arrayBuffer()) })
  try {
    const pdf = await loadingTask.promise
    const pages = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const originalViewport = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(2, 1400 / originalViewport.width) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('A canvas could not be created to display a PDF page.')
      await page.render({ canvas, canvasContext: context, viewport }).promise
      pages.push({
        key: `${path}-${pageNumber}`,
        label,
        fileName,
        previewUrl: canvas.toDataURL('image/png'),
        openUrl: signed.signedUrl,
        pageNumber,
        pageCount: pdf.numPages,
      })
      page.cleanup()
    }
    return pages
  } finally {
    await loadingTask.destroy()
  }
}

export function ManageApplication({ type }) {
  const config = reviewTypes[type]
  const { applicationId } = useParams()
  const navigate = useNavigate()
  const coordinatorName = useAppStore((state) => state.profile?.name)
  const [application, setApplication] = useState(null)
  const [lookups, setLookups] = useState({ cycles: [], universities: [], countries: [], contacts: [] })
  const [profiles, setProfiles] = useState(new Map())
  const [photoUrl, setPhotoUrl] = useState('')
  const [attachments, setAttachments] = useState({ loading: true, pages: [], error: '' })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingDecision, setPendingDecision] = useState(null)
  const [decisionUpdate, setDecisionUpdate] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [updatesRefresh, setUpdatesRefresh] = useState(0)
  const [decision, setDecision] = useState({ loading: false, error: '', message: '' })
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    let isCurrent = true
    const loadApplication = async () => {
      try {
        const { data: row, error: readError } = await supabase
          .from(config.table)
          .select('*')
          .eq('application_id', applicationId)
          .maybeSingle()
        if (readError) throw readError
        if (!row) throw new Error('This application could not be found.')
        const [cyclesResult, universitiesResult, countriesResult, contactsResult, studentProfiles] = await Promise.all([
          supabase.from('exchange_cycle').select('*').order('id'),
          supabase.from('partneruniversity').select('university_id, name, available').order('name'),
          supabase.from('country').select('id, name').order('name'),
          row.emergency_contact
            ? supabase.from('emergency_contact').select('*').eq('contact_id', row.emergency_contact)
            : Promise.resolve({ data: [] }),
          readProfiles(config.profileTable, [row]),
        ])
        for (const result of [cyclesResult, universitiesResult, countriesResult, contactsResult]) {
          if (result.error) throw result.error
        }
        if (!isCurrent) return
        setApplication(row)
        setProfiles(studentProfiles)
        setLookups({
          cycles: cyclesResult.data || [],
          universities: universitiesResult.data || [],
          countries: countriesResult.data || [],
          contacts: contactsResult.data || [],
        })
      } catch (loadError) {
        if (isCurrent) setError(loadError.message || 'The application could not be loaded.')
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    loadApplication()
    // The student can still withdraw or the status can change elsewhere while the coordinator
    // reads, so the page follows the row instead of showing what it was when it opened.
    const channel = supabase
      .channel(`${type}-application-${applicationId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: config.table, filter: `application_id=eq.${applicationId}` },
        ({ new: row }) => {
          if (isCurrent && row?.application_id) setApplication(row)
        },
      )
      .subscribe()
    return () => {
      isCurrent = false
      supabase.removeChannel(channel)
    }
  }, [applicationId, config.table, config.profileTable, type])

  const photoPath = application?.profile_photo || ''
  useEffect(() => {
    if (!photoPath) return undefined
    let isCurrent = true
    supabase.storage
      .from(config.bucket)
      .createSignedUrl(photoPath, 3600)
      .then(({ data: signed }) => {
        if (isCurrent) setPhotoUrl(signed?.signedUrl || '')
      })
    return () => {
      isCurrent = false
    }
  }, [photoPath, config.bucket])

  const attachmentPaths = config.attachments.map(([key]) => application?.[key] || '')
  const attachmentKey = attachmentPaths.join('|')
  useEffect(() => {
    if (!application) return undefined
    let isCurrent = true
    const files = config.attachments
      .map(([key, label]) => [application[key], label])
      .filter(([path]) => Boolean(path))
    Promise.all(files.map(([path, label]) => loadAttachmentPages(config.bucket, path, label)))
      .then((results) => {
        if (isCurrent) setAttachments({ loading: false, pages: results.flat(), error: '' })
      })
      .catch((loadError) => {
        if (isCurrent) setAttachments({ loading: false, pages: [], error: loadError.message || 'The attachments could not be loaded.' })
      })
    return () => {
      isCurrent = false
    }
    // Realtime status changes replace the row, so this follows the file paths only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application?.application_id, attachmentKey, config])

  const backToApplications = () => {
    navigate('/portal', { state: { view: 'applications', applicationType: type } })
  }

  const confirmDecision = async () => {
    const accept = pendingDecision === 'accept'
    setDecision({ loading: true, error: '', message: '' })
    const { data: row, error: decisionError } = await supabase.rpc(config.reviewFunction, {
      requested_application_id: application.application_id,
      accept_application: accept,
      update_details: decisionUpdate.trim() || null,
    })
    if (decisionError) {
      setDecision({ loading: false, error: decisionError.message || 'The decision could not be saved.', message: '' })
      return
    }
    setApplication(row)
    setPendingDecision(null)
    setDecisionUpdate('')
    setUpdatesRefresh((count) => count + 1)
    setDecision({ loading: false, error: '', message: `The application was ${accept ? 'accepted' : 'rejected'}, and the student was sent an update.` })
  }

  const saveEditedApplication = (edited) => {
    setIsEditing(false)
    setDecision({ loading: false, error: '', message: '' })
    navigate(`/portal/applications/${type}/${edited.application_id}`, { replace: true })
  }

  const exportPdf = async () => {
    try {
      setExportError('')
      await downloadApplicationPdf(application, type, { ...lookups, profiles: { [type]: profiles } }, coordinatorName)
    } catch (exportFailure) {
      setExportError(exportFailure.message || 'The application PDF could not be exported.')
    }
  }

  const status = application?.application_status || 'Unknown'
  const statusClass = status.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const canDecide = decidableStatuses.includes(status)
  const ApplicationEditor = applicationEditors[type]
  const studentName = application ? getStudentName(application, profiles) : ''
  const studentEmail = application ? profiles.get(String(application.student_id))?.student_email || application.email : ''
  const initials = studentName.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  // Shown elsewhere on the page (the photo, the attachments and the linked update), or only an
  // internal reference, so they are left out of the plain list of submitted details.
  const fieldsShownElsewhere = ['profile_photo', 'update_id', 'original_application_id', ...config.attachments.map(([key]) => key)]
  const detailFields = application
    ? getApplicationFields(
      Object.fromEntries(Object.entries(application).filter(([key]) => !fieldsShownElsewhere.includes(key))),
      lookups,
    )
    : []
  const hasAttachments = attachmentPaths.some(Boolean)

  return (
    <section className="portal-page coordinator-review" aria-labelledby="review-heading">
      <div className="portal-card portal-card--wide">
        <div className="coordinator-review__toolbar">
          <button className="btn btn--secondary" type="button" onClick={backToApplications}>
            ← Back to applications
          </button>
          {application && (
            <button className="btn btn--secondary" type="button" onClick={exportPdf}>Export PDF</button>
          )}
        </div>
        {isLoading && <p role="status">Loading application...</p>}
        {!isLoading && error && <p className="auth-form__error" role="alert">{error}</p>}
        {exportError && <p className="auth-form__error" role="alert">{exportError}</p>}
        {!isLoading && application && (
          <>
            <header className="coordinator-review__header">
              {photoUrl ? (
                <img className="coordinator-review__photo" src={photoUrl} alt={`Personal photo of ${studentName}`} />
              ) : (
                <div className="coordinator-review__photo coordinator-review__photo--empty" aria-hidden="true">{initials}</div>
              )}
              <div className="coordinator-review__identity">
                <span className="auth-card__eyebrow">Manage {config.label} application</span>
                <h1 id="review-heading">{studentName}</h1>
                <p className="coordinator-review__meta">
                  Student ID: {application.student_id || 'Unavailable'} · {getCycleLabel(application, lookups.cycles)}
                  {studentEmail ? ` · ${studentEmail}` : ''}
                </p>
                <div className="coordinator-review__status">
                  <span>Status</span>
                  <span className={`coordinator-review__badge coordinator-review__badge--${statusClass}`}>{status}</span>
                  <span className="coordinator-review__live">Updates live</span>
                </div>
              </div>
            </header>

            <div className="coordinator-review__layout">
              <div className="coordinator-review__main">
                {canDecide && isEditing && (
                  <section className="coordinator-review__panel">
                    <Suspense fallback={<p role="status">Loading the edit form...</p>}>
                      <ApplicationEditor
                        application={application}
                        countries={lookups.countries}
                        cycles={lookups.cycles}
                        universities={lookups.universities}
                        editorLabel="this"
                        onSaved={saveEditedApplication}
                        onCancel={() => setIsEditing(false)}
                      />
                    </Suspense>
                  </section>
                )}

                <section className="coordinator-review__panel" aria-labelledby="review-decision-heading">
                  <h2 id="review-decision-heading">Decision</h2>
                  {canDecide && !pendingDecision && (
                    <div className="nomination-table__actions">
                      <button className="btn btn--primary" type="button" onClick={() => setPendingDecision('accept')}>Accept application</button>
                      <button className="btn btn--danger" type="button" onClick={() => setPendingDecision('reject')}>Reject application</button>
                      {!isEditing && (
                        <button className="btn btn--secondary" type="button" onClick={() => setIsEditing(true)}>Edit application</button>
                      )}
                    </div>
                  )}
                  {canDecide && pendingDecision && (
                    <>
                      <p>
                        {pendingDecision === 'accept' ? 'Accept' : 'Reject'} the application from {studentName}?
                        The student will see the status “{pendingDecision === 'accept' ? 'Accepted' : 'Rejected'}”.
                      </p>
                      <label className="update-composer__field">
                        {pendingDecision === 'accept' ? 'Next steps for the student' : 'Reason for rejection'} <span>(optional)</span>
                        <textarea
                          rows={4}
                          value={decisionUpdate}
                          onChange={(event) => setDecisionUpdate(event.target.value)}
                          disabled={decision.loading}
                        />
                      </label>
                      <p className="update-composer__hint">
                        Left empty, the student receives: “{pendingDecision === 'accept'
                          ? defaultDecisionUpdates.accept
                          : defaultDecisionUpdates.reject}”
                      </p>
                      <div className="nomination-table__actions">
                        <button
                          className={pendingDecision === 'accept' ? 'btn btn--primary' : 'btn btn--danger'}
                          type="button"
                          onClick={confirmDecision}
                          disabled={decision.loading}
                        >
                          {decision.loading ? 'Saving…' : `Confirm ${pendingDecision === 'accept' ? 'acceptance' : 'rejection'}`}
                        </button>
                        <button className="btn btn--secondary" type="button" onClick={() => {
                          setPendingDecision(null)
                          setDecisionUpdate('')
                        }} disabled={decision.loading}>
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                  {!canDecide && (
                    <p>
                      {status === 'Draft'
                        ? 'The student has not submitted this application yet, so it cannot be decided.'
                        : ['Accepted', 'Rejected'].includes(status)
                          ? `This application was ${status.toLowerCase()}.`
                          : `This application is ${status}, so it cannot be decided.`}
                    </p>
                  )}
                  {decision.error && <p className="auth-form__error" role="alert">{decision.error}</p>}
                  {decision.message && <p className="coordinator-review__message" role="status">{decision.message}</p>}
                </section>

                {type === 'outbound' && <AlternativeOffers application={application} universities={lookups.universities} />}

                <UpdateHistory
                  type={type}
                  applicationId={application.application_id}
                  refreshKey={updatesRefresh}
                  headingId="review-updates-heading"
                />

                <ModificationHistory type={type} application={application} refreshKey={status} />

                <section className="coordinator-review__section" aria-labelledby="review-details-heading">
                  <h2 id="review-details-heading">Submitted details</h2>
                  <dl className="coordinator-applications__fields coordinator-review__fields">
                    {detailFields.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{formatValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                {hasAttachments && (
                  <section className="coordinator-review__section" aria-labelledby="review-attachments-heading">
                    <h2 id="review-attachments-heading">Attachments</h2>
                    {attachments.loading && <p role="status">Loading attachments...</p>}
                    {attachments.error && <p className="auth-form__error" role="alert">{attachments.error}</p>}
                    <div className="coordinator-review__attachments">
                      {attachments.pages.map((page) => (
                        <figure key={page.key} className="coordinator-review__attachment">
                          <figcaption>
                            <strong>{page.label}</strong>
                            {page.pageNumber ? ` — page ${page.pageNumber} of ${page.pageCount}` : ''}
                            <a href={page.openUrl} target="_blank" rel="noreferrer">Open file</a>
                          </figcaption>
                          <img src={page.previewUrl} alt={`${page.label}${page.pageNumber ? `, page ${page.pageNumber}` : ''}`} />
                        </figure>
                      ))}
                    </div>
                  </section>
                )}
              </div>
              <ApplicationMetrics application={application} type={type} />
            </div>
          </>
        )}
      </div>
    </section>
  )
}

export function SendApplicationUpdate() {
  const [applicationType, setApplicationType] = useState('outbound')
  const [data, setData] = useState({ inbound: [], outbound: [], profiles: { inbound: new Map(), outbound: new Map() }, cycles: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState({ loading: false, error: '', message: '' })
  const [updatesRefresh, setUpdatesRefresh] = useState(0)

  useEffect(() => {
    let isCurrent = true
    const load = async () => {
      try {
        const [inbound, outbound, cyclesResult] = await Promise.all([
          readAllRows('inboundapplication'),
          readAllRows('outboundapplication'),
          supabase.from('exchange_cycle').select('id, semester, academic_year').order('id'),
        ])
        if (cyclesResult.error) throw cyclesResult.error
        const [inboundProfiles, outboundProfiles] = await Promise.all([
          readProfiles('incomingstudentauth', inbound),
          readProfiles('kustudentauth', outbound),
        ])
        if (!isCurrent) return
        setData({
          inbound,
          outbound,
          profiles: { inbound: inboundProfiles, outbound: outboundProfiles },
          cycles: cyclesResult.data || [],
        })
      } catch (error) {
        if (isCurrent) setLoadError(error.message || 'Applications could not be loaded.')
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }
    load()
    return () => {
      isCurrent = false
    }
  }, [])

  const profiles = data.profiles[applicationType]
  const query = search.trim().toLowerCase()
  const options = data[applicationType]
    .filter((application) => application.application_status !== 'Modified')
    .map((application) => ({
      application,
      label: `${getStudentName(application, profiles)} · ID ${application.student_id || 'unavailable'} · ${getCycleLabel(application, data.cycles)} · ${application.application_status}`,
    }))
    .filter(({ label }) => !query || label.toLowerCase().includes(query))
    .sort((left, right) => left.label.localeCompare(right.label))
  const selected = data[applicationType].find(({ application_id }) => String(application_id) === selectedId)

  const changeType = (nextType) => {
    setApplicationType(nextType)
    setSelectedId('')
    setSearch('')
    setSending({ loading: false, error: '', message: '' })
  }

  const sendUpdate = async (event) => {
    event.preventDefault()
    const message = details.trim()
    if (!selected) {
      setSending({ loading: false, error: 'Choose the application this update is about.', message: '' })
      return
    }
    if (!message) {
      setSending({ loading: false, error: 'Write the update before sending it.', message: '' })
      return
    }
    setSending({ loading: true, error: '', message: '' })
    const { error } = await supabase
      .from('updates')
      .insert({ [reviewTypes[applicationType].updateColumn]: selected.application_id, details: message })
    if (error) {
      setSending({ loading: false, error: error.message || 'The update could not be sent.', message: '' })
      return
    }
    setDetails('')
    setUpdatesRefresh((count) => count + 1)
    setSending({ loading: false, error: '', message: `The update was sent to ${getStudentName(selected, profiles)}.` })
  }

  return (
    <section className="coordinator-applications" aria-labelledby="portal-heading">
      <span className="auth-card__eyebrow">Student inbox</span>
      <h2 id="portal-heading">Send an update</h2>
      <p>Choose an application and write an update. The student sees it in their portal inbox.</p>
      <div className="coordinator-applications__type-tabs" role="group" aria-label="Application type">
        <button className={applicationType === 'outbound' ? 'btn btn--primary' : 'btn btn--secondary'} type="button" onClick={() => changeType('outbound')}>
          Outbound
        </button>
        <button className={applicationType === 'inbound' ? 'btn btn--primary' : 'btn btn--secondary'} type="button" onClick={() => changeType('inbound')}>
          Inbound
        </button>
      </div>
      {loadError && <p className="auth-form__error" role="alert">{loadError}</p>}
      {isLoading ? <p role="status">Loading applications...</p> : (
        <form className="update-composer" onSubmit={sendUpdate} noValidate>
          <label className="update-composer__field">
            Search applications
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student name, ID, semester or status" />
          </label>
          <label className="update-composer__field">
            Application
            <select
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value)
                setSending({ loading: false, error: '', message: '' })
              }}
            >
              <option value="">{options.length === 0 ? 'No applications match' : 'Choose an application'}</option>
              {options.map(({ application, label }) => (
                <option key={application.application_id} value={application.application_id}>{label}</option>
              ))}
            </select>
          </label>
          <label className="update-composer__field">
            Update
            <textarea rows={5} value={details} onChange={(event) => setDetails(event.target.value)} disabled={sending.loading} />
          </label>
          <div className="nomination-table__actions">
            <button className="btn btn--primary" type="submit" disabled={sending.loading}>
              {sending.loading ? 'Sending…' : 'Send update'}
            </button>
          </div>
          {sending.error && <p className="auth-form__error" role="alert">{sending.error}</p>}
          {sending.message && <p className="coordinator-review__message" role="status">{sending.message}</p>}
        </form>
      )}
      {selected && (
        <UpdateHistory
          type={applicationType}
          applicationId={selected.application_id}
          refreshKey={updatesRefresh}
          headingId="send-update-history-heading"
        />
      )}
    </section>
  )
}
