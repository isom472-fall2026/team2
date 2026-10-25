import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import { supabase } from '../supabase'
import { useAppStore } from '../stores/appStore'
import './CoordinatorApplications.css'

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
        return ['Exchange cycle', cycleById.get(String(value)) || `Cycle #${value}`]
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

function downloadApplicationPdf(application, applicationType, data, coordinatorName) {
  const studentId = application.student_id || 'unknown'
  const cycle = getCycleLabel(application, data.cycles)
  const university = data.universities.find(
    ({ university_id }) => Number(university_id) === Number(application.university_id),
  )?.name || 'University unavailable'
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16
  const lineHeight = 6
  let cursorY = 18

  const writeLine = (text, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    const wrapped = doc.splitTextToSize(String(text), pageWidth - margin * 2)
    if (cursorY + wrapped.length * lineHeight > pageHeight - margin) {
      doc.addPage()
      cursorY = margin
    }
    doc.text(wrapped, margin, cursorY)
    cursorY += wrapped.length * lineHeight
  }

  writeLine(`${applicationType === 'inbound' ? 'Inbound' : 'Outbound'} application`, true)
  writeLine(`Student ID: ${studentId}`)
  writeLine(`Student: ${getStudentName(application, data.profiles[applicationType])}`)
  writeLine(`Destination university: ${university}`)
  writeLine(`Cycle: ${cycle}`)
  writeLine(`Current status: ${application.application_status}`)
  writeLine(`Export date: ${new Date().toLocaleDateString()}`)
  writeLine(`Exported by: ${coordinatorName || 'KU coordinator'}`)
  cursorY += lineHeight

  getApplicationFields(application, data).forEach(([label, value]) => {
    writeLine(`${label}: ${value}`)
  })

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
  }

  const safeCycle = cycle.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '')
  doc.save(`${studentId}-${safeCycle || 'cycle'}.pdf`)
}

function ApplicationList({ applications, profiles, cycles, universities, countries, contacts, selected, onSelect, onExport, loading, emptyMessage }) {
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
                <td>{application.application_status}</td>
                <td>
                  <div className="nomination-table__actions">
                    <button className="btn btn--secondary" type="button" onClick={() => onSelect(application)}>
                      View details
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
      {selected && (
        <ApplicationDetails
          application={selected}
          profiles={profiles[selected.type]}
          cycles={cycles}
          universities={universities}
          countries={countries}
          contacts={contacts}
          onClose={() => onSelect(null)}
          onExport={() => onExport(selected)}
        />
      )}
    </div>
  )
}

function ApplicationDetails({ application, profiles, cycles, universities, countries, contacts, onClose, onExport }) {
  const data = { cycles, universities, countries, contacts }
  const profile = profiles.get(String(application.student_id))

  return (
    <section className="coordinator-applications__details" aria-labelledby="application-details-heading">
      <div className="coordinator-applications__detail-heading">
        <div>
          <span className="auth-card__eyebrow">{application.type} application</span>
          <h3 id="application-details-heading">{getStudentName(application, profiles)}</h3>
          <p>Student ID: {application.student_id || 'Unavailable'} · {getCycleLabel(application, cycles)} · {application.application_status}</p>
          {profile?.student_email && <p>{profile.student_email}</p>}
        </div>
        <div className="nomination-table__actions">
          <button className="btn btn--primary" type="button" onClick={onExport}>Export PDF</button>
          <button className="btn btn--secondary" type="button" onClick={onClose}>Close details</button>
        </div>
      </div>
      <dl className="coordinator-applications__fields">
        {getApplicationFields(application, data).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default function CoordinatorApplications() {
  const coordinatorName = useAppStore((state) => state.profile?.name)
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
  const [section, setSection] = useState('current')
  const [applicationType, setApplicationType] = useState('outbound')
  const [search, setSearch] = useState('')
  const [nationalityFilter, setNationalityFilter] = useState('')
  const [universityFilter, setUniversityFilter] = useState('')
  const [semesterOrder, setSemesterOrder] = useState('descending')
  const [selected, setSelected] = useState(null)
  const [exportError, setExportError] = useState('')

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
    return data.cycles
      .filter((cycle) => cycle.application_o && cycle.application_c
        && new Date(cycle.application_o).getTime() <= now
        && new Date(cycle.application_c).getTime() >= now)
      .sort((left, right) => new Date(right.application_o) - new Date(left.application_o))[0] || null
  }, [data.cycles, now])

  const profiles = {
    inbound: data.inboundProfiles,
    outbound: data.outboundProfiles,
  }
  const records = data[applicationType].map((application) => ({ ...application, type: applicationType }))
  const currentApplications = records.filter(
    (application) => currentCycle && Number(application.semester_applied_for) === Number(currentCycle.id),
  )
  const historicalApplications = records.filter(
    (application) => application.application_status === 'Approved'
      && (!currentCycle || Number(application.semester_applied_for) !== Number(currentCycle.id)),
  )

  const visibleApplications = (section === 'current' ? currentApplications : historicalApplications)
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
      return getStudentName(left, profiles[applicationType]).localeCompare(getStudentName(right, profiles[applicationType]))
    })

  const exportPdf = (application) => {
    try {
      setExportError('')
      downloadApplicationPdf(
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
    <section className="coordinator-applications" aria-labelledby="portal-heading">
      <span className="auth-card__eyebrow">Application records</span>
      <h2 id="portal-heading">Current cycle and historical applications</h2>
      <p>Review current-cycle applications, including drafts, and approved applications from previous cycles.</p>
      <div className="coordinator-applications__section-tabs" role="group" aria-label="Application period">
        <button className={section === 'current' ? 'btn btn--primary' : 'btn btn--secondary'} type="button" onClick={() => { setSection('current'); setSelected(null) }}>
          Current cycle
        </button>
        <button className={section === 'history' ? 'btn btn--primary' : 'btn btn--secondary'} type="button" onClick={() => { setSection('history'); setSelected(null) }}>
          Historical applications
        </button>
      </div>
      {section === 'current' && (
        <p className="coordinator-applications__cycle">
          {currentCycle ? `Application window: ${currentCycle.semester} ${currentCycle.academic_year}` : 'There is no exchange cycle in its application window right now.'}
        </p>
      )}
      <div className="coordinator-applications__type-tabs" role="group" aria-label="Application type">
        <button className={applicationType === 'outbound' ? 'btn btn--primary' : 'btn btn--secondary'} type="button" onClick={() => { setApplicationType('outbound'); setSelected(null) }}>
          Outbound
        </button>
        <button className={applicationType === 'inbound' ? 'btn btn--primary' : 'btn btn--secondary'} type="button" onClick={() => { setApplicationType('inbound'); setSelected(null) }}>
          Inbound
        </button>
      </div>
      <div className="coordinator-applications__filters">
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
      </div>
      {error && <p className="auth-form__error" role="alert">{error}</p>}
      {exportError && <p className="auth-form__error" role="alert">{exportError}</p>}
      <p className="coordinator-applications__count" aria-live="polite">{visibleApplications.length} application(s)</p>
      <ApplicationList
        applications={visibleApplications}
        profiles={profiles}
        cycles={data.cycles}
        universities={data.universities}
        countries={data.countries}
        contacts={data.contacts}
        selected={selected}
        onSelect={setSelected}
        onExport={exportPdf}
        loading={isLoading}
        emptyMessage={section === 'history'
          ? 'No approved applications from previous cycles match these filters.'
          : 'No applications in the current application cycle match these filters.'}
      />
    </section>
  )
}
