import { toDate } from './dates.js'

// An outbound approval is stored as Accepted; older and demo records use Approved. Both mean
// the student was approved to go.
export const approvedStatuses = ['Accepted', 'Approved']

export function ratingError(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'Choose a rating from 1 to 5.'
  const rating = Number(text)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 'The rating must be a whole number from 1 to 5.'
  return ''
}

export function semesterHasEnded(cycle, now = new Date()) {
  if (!cycle?.cycle_end) return false
  const end = toDate(cycle.cycle_end)
  return !Number.isNaN(end.getTime()) && end < now
}
