// Shared by the schedule pages and the schedule PDF, so both show a course the same way.
import { formatDate } from './dates'

// KU's teaching week starts on Sunday.
export const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Class times are stored as Kuwait wall-clock times. Formatting them as UTC prints those digits
// unchanged, whatever time zone the reader's device is in.
const clockTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })

export function formatClassTime(value) {
  const [hours, minutes] = String(value).split(':').map(Number)
  return clockTime.format(Date.UTC(1970, 0, 1, hours, minutes))
}

export function formatClassTimes(item) {
  return `${formatClassTime(item.start_time)} – ${formatClassTime(item.end_time)}`
}

export function semesterName(cycle) {
  return cycle ? `${cycle.semester} ${cycle.academic_year}` : 'KU semester'
}

export function semesterDates(cycle) {
  if (!cycle?.cycle_start || !cycle?.cycle_end) return 'Semester dates to be announced'
  return `${formatDate(cycle.cycle_start)} to ${formatDate(cycle.cycle_end)}`
}

function compareTimes(left, right) {
  return left.start_time.localeCompare(right.start_time) || left.course_display_code.localeCompare(right.course_display_code)
}

// Days are stored in week order, so a course's first day is the earliest it meets.
export function compareCourses(left, right) {
  return weekDays.indexOf(left.meeting_days[0]) - weekDays.indexOf(right.meeting_days[0]) || compareTimes(left, right)
}

// A course appears under every day it meets, so the week can be read one day at a time.
export function coursesByDay(items) {
  return weekDays
    .map((day) => ({ day, courses: items.filter((item) => item.meeting_days.includes(day)).sort(compareTimes) }))
    .filter(({ courses }) => courses.length > 0)
}
