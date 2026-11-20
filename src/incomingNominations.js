export function preferredNominationId(nominations, availableCycles, applications) {
  const cycleIds = new Set(availableCycles.map(({ id }) => String(id)))
  const currentApplications = applications.filter(({ application_status }) => !['Rejected', 'Modified'].includes(application_status))
  const usedCycles = new Set(currentApplications.map(({ semester_applied_for }) => String(semester_applied_for)))
  const usedNominations = new Set(currentApplications.map(({ nomination_id }) => String(nomination_id)))
  const nomination = [...nominations]
    .filter(({ id, semester, nomination_status }) => nomination_status === 'Active'
      && cycleIds.has(String(semester))
      && !usedCycles.has(String(semester))
      && !usedNominations.has(String(id)))
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at) || Number(right.id) - Number(left.id))[0]
  return nomination ? String(nomination.id) : ''
}
