// Every date the portal shows goes through these, so they all read the same way: "2 Jan 2027"
// for a day and "2 Jan 2027, 9:37 AM" for a moment. Moments are shown in Kuwait time, where the
// exchange office works and where every deadline is set.
const KUWAIT = 'Asia/Kuwait'
const dayInKuwait = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: KUWAIT })
const timeInKuwait = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: KUWAIT })
// A date with no time (a birthday, an expiry date) is a calendar day, not a moment, so it is
// printed as written rather than moved into a time zone.
const calendarDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const calendarMonth = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/

// Supabase returns "timestamp without time zone" columns with no offset. They hold UTC (the
// semester editor saves UTC and the database clock is UTC), but a browser reads an offset-free
// time as its own local time, which in Kuwait put them three hours early. They are marked as
// UTC before reading.
export function toDate(value) {
  if (value instanceof Date) return value
  const text = String(value)
  const hasOffset = /(Z|[+-]\d{2}(:?\d{2})?)$/i.test(text)
  return new Date(text.includes('T') && !hasOffset ? `${text}Z` : text)
}

function calendarDate(text) {
  const [, year, month, day] = text.match(dateOnly)
  return Date.UTC(Number(year), Number(month) - 1, Number(day))
}

export function formatDate(value, empty = '') {
  if (!value) return empty
  const text = String(value)
  if (dateOnly.test(text)) return calendarDay.format(calendarDate(text))
  const date = toDate(value)
  return Number.isNaN(date.getTime()) ? text : dayInKuwait.format(date)
}

export function formatDateTime(value, empty = '') {
  if (!value) return empty
  const text = String(value)
  if (dateOnly.test(text)) return formatDate(text)
  const date = toDate(value)
  return Number.isNaN(date.getTime()) ? text : `${dayInKuwait.format(date)}, ${timeInKuwait.format(date)}`
}

export function formatMonth(value, empty = '') {
  if (!value) return empty
  const match = String(value).match(/^(\d{4})-(\d{2})/)
  return match ? calendarMonth.format(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)) : String(value)
}
