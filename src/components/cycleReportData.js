import { supabase } from '../supabase'

const dayMs = 86_400_000
const pageSize = 500
const kuwaitDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuwait', year: 'numeric', month: '2-digit', day: '2-digit',
})

async function readApplications(table, cycleId, signal) {
  const applications = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from(table)
      .select('application_status, university_id, submitted_at')
      .eq('semester_applied_for', cycleId)
      .not('application_status', 'in', '(Draft,Modified)')
      .not('submitted_at', 'is', null)
      .order('application_id')
      .range(offset, offset + pageSize - 1)
      .abortSignal(signal)

    if (error) throw error
    applications.push(...data)
    if (data.length < pageSize) return applications
  }
}

export function readCycleApplications(cycleId, signal) {
  return Promise.all([
    readApplications('inboundapplication', cycleId, signal),
    readApplications('outboundapplication', cycleId, signal),
  ])
}

function countBy(rows, keyOf) {
  const counts = new Map()
  for (const row of rows) {
    const key = keyOf(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function cycleTime(value) {
  if (!value) return NaN
  // The cycle editor sends UTC ISO strings to timestamp-without-time-zone columns.
  return Date.parse(value.length > 10 && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value + 'Z' : value)
}

function kuwaitDay(time) {
  return Date.parse(kuwaitDate.format(time))
}

function submissionsByDay(applications, cycle) {
  const opens = cycleTime(cycle.application_o)
  const closes = cycleTime(cycle.application_c)
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || closes < opens) return null

  const counts = new Map()
  for (const { submitted_at } of applications) {
    const time = Date.parse(submitted_at)
    if (time >= opens && time <= closes) {
      const day = kuwaitDay(time)
      counts.set(day, (counts.get(day) ?? 0) + 1)
    }
  }

  const firstDay = kuwaitDay(opens)
  const lastDay = kuwaitDay(closes)
  const days = []
  for (let day = firstDay; day <= lastDay; day += dayMs) {
    days.push({ label: new Date(day).toISOString().slice(0, 10), count: counts.get(day) ?? 0 })
  }
  return days
}

export function summarizeCycle(cycle, inbound, outbound, universities) {
  const applications = [...inbound, ...outbound]
  const names = new Map(universities.map((university) => [university.university_id, university.name]))
  return {
    total: applications.length,
    statuses: countBy(applications, (application) => application.application_status),
    destinations: countBy([
      ...inbound.map(() => 'Kuwait University'),
      ...outbound.map(({ university_id }) => names.get(university_id) ?? 'Destination not specified'),
    ], (name) => name),
    daily: submissionsByDay(applications, cycle),
  }
}
