import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { getDatabaseErrorMessage } from './databaseErrors'

export default function TestStatusPage() {
  const [status, setStatus] = useState('checking')
  const [countries, setCountries] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const loadStatus = async () => {
      const { data, error: countryError } = await supabase
        .from('country')
        .select('id, name, city')
        .order('name')

      if (countryError) {
        setStatus('failure')
        setError(getDatabaseErrorMessage(countryError))
        return
      }

      setCountries(data || [])
      setStatus('success')
    }

    loadStatus()
  }, [])

  return (
    <section className="status-page" aria-labelledby="status-heading">
      <div className="status-card">
        <span className="auth-card__eyebrow">System diagnostics</span>
        <h1 id="status-heading">Test and Status</h1>
        <div className="database-status">
          <span className={`database-status__dot database-status__dot--${status}`} aria-hidden="true" />
          <strong>Database connection: {status === 'checking' ? 'Checking...' : status === 'success' ? 'Connected' : 'Failed'}</strong>
        </div>
        {error && <p className="auth-form__error" role="alert">{error}</p>}
        <div className="status-graph" aria-label="Animated database activity graph">
          {[35, 58, 42, 76, 50, 82, 61, 90, 48, 70, 55, 85].map((height, index) => (
            <span key={index} style={{ height: `${height}%`, animationDelay: `${index * 0.12}s` }} />
          ))}
        </div>
        <h2 className="portal-section-heading">Countries loaded from database</h2>
        {countries.length === 0 ? <p>No countries returned.</p> : (
          <ul className="country-list">
            {countries.map((country) => (
              <li key={country.id}><strong>{country.name}</strong>{country.city ? ` · ${country.city}` : ''}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
