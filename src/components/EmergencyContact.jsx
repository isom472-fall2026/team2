import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { phoneCountryCodes } from '../phoneCountryCodes'

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
  const [query, setQuery] = useState('')
  const [contacts, setContacts] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  async function search(event) {
    event.preventDefault()
    const term = query.trim()
    if (!term) return
    setContacts(null)
    setError('')
    setSearching(true)
    try {
      const { data, error: searchError } = await supabase.rpc('find_emergency_contacts', { search_term: term })
      if (searchError) setError(getDatabaseErrorMessage(searchError))
      else setContacts(data)
    } finally {
      setSearching(false)
    }
  }

  return (
    <section>
      <h2>Emergency contacts</h2>
      <form className="auth-form" onSubmit={search}>
        <label>Student name or email
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={255} disabled={searching} required />
        </label>
        <button className="btn btn--primary" disabled={searching || !query.trim()}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>
      {error && <p className="auth-form__error" role="alert">{error}</p>}
      {contacts?.length === 0 && <p role="status">No emergency contacts match your search.</p>}
      {contacts?.length === 50 && <p role="status">Showing the first 50 matches. Enter a more specific name or email to narrow the results.</p>}
      {contacts?.map((contact) => (
        <article className="portal-card" key={contact.student_id}>
          <h3>{contact.student_name}</h3>
          <p>{contact.student_email}</p>
          <dl>
            <dt>Contact name</dt><dd>{contact.contact_name}</dd>
            <dt>Phone number</dt><dd>{contact.contact_phone}</dd>
            {contact.contact_email && <><dt>Contact email</dt><dd>{contact.contact_email}</dd></>}
          </dl>
        </article>
      ))}
    </section>
  )
}
