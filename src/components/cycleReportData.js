import { supabase } from '../supabase'
import { inboundApprovalLabel } from '../inboundApproval'

export const dayMs = 86_400_000
const pageSize = 500
const kuwaitDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuwait', year: 'numeric', month: '2-digit', day: '2-digit',
})

async function readApplications(table, fields, cycleId, signal) {
  const applications = []
  for (let offset = 0; ; offset += pageSize) {
    const query = supabase.from(table)
      .select(`application_status, university_id, submitted_at, semester_applied_for, ${fields}`)
      .not('application_status', 'in', '(Draft,Modified)')
      .not('submitted_at', 'is', null)
    const scoped = cycleId == null
      ? query.not('semester_applied_for', 'is', null)
      : query.eq('semester_applied_for', cycleId)
    const { data, error } = await scoped.order('application_id')
      .range(offset, offset + pageSize - 1)
      .abortSignal(signal)

    if (error) throw error
    applications.push(...data)
    if (data.length < pageSize) return applications
  }
}

export function readCycleApplications(cycleId, signal) {
  return Promise.all([
    readApplications('inboundapplication', 'nationality, approval_type', cycleId, signal),
    readApplications('outboundapplication', 'gpa, credits_passed', cycleId, signal),
  ])
}

function countBy(rows, keyOf) {
  const counts = new Map()
  for (const row of rows) {
    const key = keyOf(row)
    if (key == null) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function average(rows, field) {
  let sum = 0
  let count = 0
  for (const row of rows) {
    if (!Number.isFinite(row[field])) continue
    sum += row[field]
    count += 1
  }
  return count ? sum / count : null
}

function leaders(categories) {
  if (!categories.length) return null
  const { count } = categories[0]
  return { count, labels: categories.filter((category) => category.count === count).map(({ label }) => label) }
}

function cycleTime(value) {
  if (!value) return NaN
  // The cycle editor sends UTC ISO strings to timestamp-without-time-zone columns.
  return Date.parse(value.length > 10 && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value + 'Z' : value)
}

function kuwaitDay(time) {
  return Date.parse(kuwaitDate.format(time))
}

function cycleWindows(cycles) {
  const byCycle = new Map()
  const intervals = []
  for (const cycle of cycles) {
    const opens = cycleTime(cycle.application_o)
    const closes = cycleTime(cycle.application_c)
    if (!Number.isFinite(opens) || !Number.isFinite(closes) || closes < opens) continue
    byCycle.set(cycle.id, { opens, closes })
    intervals.push({ start: kuwaitDay(opens), end: kuwaitDay(closes) })
  }

  // An overlapping date appears once in the timeline even when multiple cycles are open.
  const ranges = []
  for (const range of intervals.sort((a, b) => a.start - b.start)) {
    const previous = ranges.at(-1)
    if (previous && range.start <= previous.end + dayMs) previous.end = Math.max(previous.end, range.end)
    else ranges.push(range)
  }
  return { byCycle, ranges }
}

function submissionsByDay(applications, { byCycle, ranges }) {
  if (!ranges.length) return null

  const counts = new Map()
  for (const { submitted_at, semester_applied_for } of applications) {
    const window = byCycle.get(semester_applied_for)
    const time = Date.parse(submitted_at)
    if (window && time >= window.opens && time <= window.closes) {
      const day = kuwaitDay(time)
      counts.set(day, (counts.get(day) ?? 0) + 1)
    }
  }

  const days = []
  for (const { start, end } of ranges) {
    for (let day = start; day <= end; day += dayMs) {
      days.push({ day, count: counts.get(day) ?? 0, startsWindow: day === start })
    }
  }
  return days
}

export function summarizeCycles(cycles, inbound, outbound, universities, countries) {
  const universityNames = new Map(universities.map(({ university_id, name }) => [university_id, name]))
  const countryNames = new Map(countries.map(({ id, name }) => [id, name]))
  const windows = cycleWindows(cycles)
  const unspecifiedNationality = 'Nationality not specified'
  const nationalities = countBy(inbound, ({ nationality }) => countryNames.get(nationality) ?? unspecifiedNationality)

  return {
    inbound: {
      total: inbound.length,
      statuses: countBy(inbound, inboundApprovalLabel),
      breakdown: nationalities,
      daily: submissionsByDay(inbound, windows),
      topNationality: leaders(nationalities.filter(({ label }) => label !== unspecifiedNationality)),
      topPartner: leaders(countBy(inbound, ({ university_id }) => universityNames.get(university_id))),
    },
    outbound: {
      total: outbound.length,
      statuses: countBy(outbound, ({ application_status }) => application_status),
      breakdown: countBy(outbound, ({ university_id }) => universityNames.get(university_id) ?? 'Destination not specified'),
      daily: submissionsByDay(outbound, windows),
      averageGpa: average(outbound, 'gpa'),
      averageCredits: average(outbound, 'credits_passed'),
    },
  }
}
