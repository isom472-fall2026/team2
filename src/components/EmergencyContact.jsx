import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { phoneCountryCodes } from '../phoneCountryCodes'
import './EmergencyContact.css'

const emptyContact = { name: '', code: '', phone: '', email: '' }

function contactForm(contact) {
  if (!contact) return emptyContact
  const codes = phoneCountryCodes.map(({ code }) => code)
  const code = codes.sort((a, b) => b.length - a.length)
    .find((value) => contact.phone_number.startsWith(value)) || ''
  return {
    name: contact.name,
    code,
    phone: contact.phone_number.slice(code.length),
    email: contact.email || '',
  }
}

export default function EmergencyContact({ studentId }) {
  const [form, setForm] = useState(emptyContact)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function loadContact() {
      const { data, error: loadError } = await supabase.from('emergency_contact')
        .select('name, phone_number, email').eq('student_id', studentId)
        .abortSignal(controller.signal).maybeSingle()
      if (controller.signal.aborted) return
      if (loadError) setError(getDatabaseErrorMessage(loadError))
      else setForm(contactForm(data))
      setLoading(false)
    }
    loadContact()
    return () => controller.abort()
  }, [studentId])

  function changeField(event) {
    const { name, value } = event.target
    setForm((previous) => ({ ...previous, [name]: value }))
    setError('')
    setMessage('')
  }

  async function save(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    const name = form.name.trim()
    const phone = form.phone.trim()
    const email = form.email.trim()
    const internationalPhone = form.code + phone.replace(/\D/g, '')

    if (!name || !form.code || !phone) {
      setError('Enter a contact name, select a country code, and enter a phone number.')
      return
    }
    if (!/^[0-9(). -]+$/.test(phone) || !/^\+[1-9][0-9]{6,14}$/.test(internationalPhone)) {
      setError('Enter a valid phone number with 7 to 15 digits including the country code.')
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address or leave it blank.')
      return
    }

    setSaving(true)
    try {
      const { error: saveError } = await supabase.rpc('save_my_emergency_contact', {
        requested_name: name,
        requested_phone: internationalPhone,
        requested_email: email || null,
      })
      if (saveError) setError(getDatabaseErrorMessage(saveError))
      else setMessage('Emergency contact saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h2>Emergency contact</h2>
      <form className="auth-form" onSubmit={save} noValidate>
        <label>Contact name
          <input name="name" autoComplete="off" maxLength={255} value={form.name} onChange={changeField} required disabled={loading || saving} />
        </label>
        <label>Country code
          <select name="code" value={form.code} onChange={changeField} required disabled={loading || saving}>
            <option value="">Select a country code</option>
            {phoneCountryCodes.map(({ country, code }) => (
              <option key={country} value={code}>{country} ({code})</option>
            ))}
          </select>
        </label>
        <label>Phone number
          <input name="phone" type="tel" maxLength={50} value={form.phone} onChange={changeField} required disabled={loading || saving} />
        </label>
        <label>Email (optional)
          <input name="email" type="email" maxLength={255} value={form.email} onChange={changeField} disabled={loading || saving} />
        </label>
        {error && <p className="auth-form__error" role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <button className="btn btn--primary" disabled={loading || saving}>
          {loading ? 'Loading contact…' : saving ? 'Saving…' : 'Save emergency contact'}
        </button>
      </form>
    </section>
  )
}

export function EmergencyContactLookup() {
  const [lookup, setLookup] = useState({ query: '', submitted: false })
  const [result, setResult] = useState(null)
  const term = lookup.query.trim()

  useEffect(() => {
    if (!term) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc('find_emergency_contacts', { search_term: term })
        .abortSignal(controller.signal)
      if (!controller.signal.aborted) {
        setResult({ lookup, contacts: data ?? [], error: error && getDatabaseErrorMessage(error) })
      }
    }, lookup.submitted ? 0 : 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [lookup, term])

  const current = result?.lookup === lookup ? result : null
  const contacts = current?.contacts ?? []

  function search(event) {
    event.preventDefault()
    if (term) setLookup({ query: lookup.query, submitted: true })
  }

  return (
    <section className="emergency-lookup" aria-labelledby="emergency-lookup-heading">
      <h2 id="emergency-lookup-heading">Emergency contacts</h2>
      <form className="auth-form emergency-lookup__form" role="search" aria-label="Emergency contacts" onSubmit={search}>
        <label htmlFor="emergency-lookup-query">Student name or email</label>
        <div className="emergency-lookup__controls">
          <input id="emergency-lookup-query" type="search" value={lookup.query}
            onChange={(event) => setLookup({ query: event.target.value, submitted: false })}
            maxLength={255} autoComplete="off" />
          <button className="btn btn--primary" disabled={!term}>Search</button>
        </div>
      </form>
      <p className="emergency-lookup__status" role="status">
        {term && !current && 'Searching…'}
        {current && !current.error && contacts.length === 0 && 'No emergency contacts match your search.'}
        {contacts.length === 1 && '1 student found'}
        {contacts.length > 1 && contacts.length < 50 && `${contacts.length} students found`}
        {contacts.length === 50 && 'Showing the first 50 matches. Refine your search to narrow the results.'}
      </p>
      {current?.error && <p className="auth-form__error" role="alert">{current.error}</p>}
      {contacts.length > 0 && (
        <ul className="emergency-lookup__results" aria-label="Matching students">
          {contacts.map((contact) => (
            <li key={contact.student_id}>
              <details open={lookup.submitted && contacts.length === 1}>
                <summary>
                  <strong>{contact.student_name}</strong>
                  <span>{contact.student_email}</span>
                </summary>
                <dl>
                  <div><dt>Contact name</dt><dd>{contact.contact_name}</dd></div>
                  <div><dt>Phone number</dt><dd><a href={`tel:${contact.contact_phone.replace(/[^+\d]/g, '')}`}>{contact.contact_phone}</a></dd></div>
                  {contact.contact_email && (
                    <div><dt>Contact email</dt><dd><a href={`mailto:${contact.contact_email}`}>{contact.contact_email}</a></dd></div>
                  )}
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
