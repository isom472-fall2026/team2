import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { formatUpdateTime } from '../formatUpdateTime'
import './ApplicationUpdates.css'

// Row Level Security returns only the updates on the signed-in student's own applications,
// so no student filter is needed here. The constraint name picks this link over the older
// application.update_id one, which points the other way between the same two tables.
const applicationSelect = {
  ku: 'outboundapplication!updates_outbound_application_id_fkey(application_id, application_status, exchange_cycle(semester, academic_year), partneruniversity(name))',
  incoming: 'inboundapplication!updates_inbound_application_id_fkey(application_id, application_status, exchange_cycle(semester, academic_year), partneruniversity(name))',
}

function describeApplication(application) {
  if (!application) return 'Application'
  const cycle = application.exchange_cycle
    ? `${application.exchange_cycle.semester} ${application.exchange_cycle.academic_year}`
    : null
  return [application.partneruniversity?.name, cycle].filter(Boolean).join(' · ') || `Application #${application.application_id}`
}

export default function StudentInbox({ role }) {
  const [state, setState] = useState({ loading: true, updates: [], error: '' })

  useEffect(() => {
    let isCurrent = true
    supabase
      .from('updates')
      .select(`id, details, created_at, application:${applicationSelect[role]}`)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!isCurrent) return
        setState(error
          ? { loading: false, updates: [], error: error.message || 'Your inbox could not be loaded.' }
          : { loading: false, updates: data || [], error: '' })
      })
    return () => {
      isCurrent = false
    }
  }, [role])

  if (state.loading) return <p role="status">Loading your inbox...</p>
  if (state.error) return <p className="auth-form__error" role="alert">{state.error}</p>
  if (state.updates.length === 0) {
    return <div className="portal-empty-state">No updates yet. Updates from the KU coordinator about your applications appear here.</div>
  }

  return (
    <ol className="update-history">
      {state.updates.map((update) => (
        <li key={update.id}>
          <strong className="update-history__application">{describeApplication(update.application)}</strong>
          <time dateTime={update.created_at}>{formatUpdateTime(update.created_at)}</time>
          <p>{update.details}</p>
        </li>
      ))}
    </ol>
  )
}
