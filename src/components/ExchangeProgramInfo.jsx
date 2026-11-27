import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAppStore } from '../stores/appStore'
import './ExchangeProgramInfo.css'
import { formatDateTime } from '../dates'

const programUrl = 'https://cbaweb.ku.edu.kw/students-alumni/student-exchange-program/'
const defaults = {
  team_description: 'The Student Exchange team coordinates study abroad for Kuwait University students and welcomes nominated students from partner universities. The team guides students through nominations, applications and preparing for their exchange.',
  additional_contacts: [],
  director_name: import.meta.env.VITE_SEP_DIRECTOR_NAME || '',
  director_email: import.meta.env.VITE_SEP_DIRECTOR_EMAIL || '',
  assistant_name: import.meta.env.VITE_SEP_ASSISTANT_NAME || '',
  assistant_email: import.meta.env.VITE_SEP_ASSISTANT_EMAIL || '',
  assistant_phone: import.meta.env.VITE_SEP_ASSISTANT_PHONE || '',
  program_instagram: 'sep.cba',
  college_instagram: 'cbaku.sa',
  college_url: 'https://cba.ku.edu.kw/',
  accreditation: 'CBA first earned accreditation from the Association to Advance Collegiate Schools of Business (AACSB) in 2005, with renewals in 2010, 2017 and 2020.',
  mailing_address: 'College of Business Administration, Kuwait University\nSabah Al-Salem University City, Shedadiya Area\nStudents Exchange Program, Associate Dean for Student Affairs\nDean’s Building, Ground Floor\nP.O. Box 5486, Safat 13055 Kuwait',
}

const fields = [
  ['team_description', 'What the team does', 'textarea'],
  ['director_name', 'Program Director name'],
  ['director_email', 'Program Director email', 'email'],
  ['assistant_name', 'Director Assistant name'],
  ['assistant_email', 'Director Assistant email', 'email'],
  ['assistant_phone', 'Director Assistant phone (international format)', 'tel', '\\+[1-9][0-9]{6,14}'],
  ['program_instagram', 'Exchange program Instagram handle', 'text', '[a-zA-Z0-9_.]{1,30}'],
  ['college_instagram', 'CBA Instagram handle', 'text', '[a-zA-Z0-9_.]{1,30}'],
  ['college_url', 'Official CBA website', 'url'],
  ['accreditation', 'Accreditation', 'textarea'],
  ['mailing_address', 'Mailing address', 'textarea'],
]

const iconPaths = {
  instagram: 'M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5z M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M17.5 6.5h.01',
  email: 'M3 5h18v14H3z M3 6l9 7 9-7',
  phone: 'M5 3h3l2 5-2 2a15 15 0 0 0 6 6l2-2 5 2v3a2 2 0 0 1-2 2C10 20 4 14 3 5a2 2 0 0 1 2-2z',
  whatsapp: 'M21 11.5a9 9 0 0 1-13.3 8L3 21l1.4-4.5A9 9 0 1 1 21 11.5z M9 7l1 2-1 1a8 8 0 0 0 4 4l1-1 2 1c0 2-1 3-3 2-3-1-6-4-6-7 0-1 1-2 2-2z',
  edit: 'M4 20l4-1 12-12-3-3L5 16z M15 6l3 3',
}

function InfoIcon({ name }) {
  return <svg className="exchange-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[name]} /></svg>
}

function ProgramEditor({ content, onSave, onCancel }) {
  const [draft, setDraft] = useState(content)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(event) {
    event.preventDefault()
    const values = Object.fromEntries(fields.map(([key]) => [key, draft[key].trim()]))
    if (Object.values(values).some((value) => !value)) {
      setError('Complete every field before publishing.')
      return
    }
    if (!/^https:\/\/[a-z0-9.-]+\.ku\.edu\.kw(?:[/?#]\S*)?$/i.test(values.college_url)) {
      setError('Enter an HTTPS address on a Kuwait University subdomain for the CBA website.')
      return
    }

    values.additional_contacts = draft.additional_contacts.map(({ name, title }) => ({
      name: name.trim(), title: title.trim(),
    }))
    if (values.additional_contacts.some(({ name, title }) => !name || !title)) {
      setError('Enter a name and title for each additional contact.')
      return
    }
    setSaving(true)
    setError('')
    const { data, error: saveError } = await supabase.from('exchange_program_info')
      .upsert({ id: 1, ...values }).select().single()
    setSaving(false)
    if (saveError) {
      setError('The page could not be published. Check the values and try again with testing mode off.')
      return
    }
    onSave(data)
  }

  return (
    <form className="exchange-info-editor" onSubmit={save}>
      <h2>Edit program information</h2>
      <p>Changes will appear on the public page. Enter only approved institutional contact details.</p>
      {fields.map(([key, label, type = 'text', pattern]) => {
        const inputProps = {
          name: key,
          required: true,
          value: draft[key],
          onChange: (event) => setDraft({ ...draft, [key]: event.target.value }),
          onBlur: (event) => setDraft({ ...draft, [key]: event.target.value.trim() }),
        }
        return (
          <label key={key}>
            {label}
            {type === 'textarea' ? <textarea {...inputProps} rows={4} /> : <input {...inputProps} type={type} pattern={pattern} />}
          </label>
        )
      })}
      <fieldset>
        <legend>Additional team members</legend>
        {draft.additional_contacts.map((contact, index) => (
          <div key={index}>
            {['name', 'title'].map((field) => (
              <label key={field}>
                {field === 'name' ? 'Member name' : 'Member title'}
                <input required value={contact[field]} onChange={(event) => {
                  const contacts = [...draft.additional_contacts]
                  contacts[index] = { ...contact, [field]: event.target.value }
                  setDraft({ ...draft, additional_contacts: contacts })
                }} />
              </label>
            ))}
            <button type="button" onClick={() => setDraft({ ...draft, additional_contacts: draft.additional_contacts.filter((_, i) => i !== index) })}>Remove member</button>
          </div>
        ))}
        <button type="button" onClick={() => setDraft({ ...draft, additional_contacts: [...draft.additional_contacts, { name: '', title: '' }] })}>Add team member</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <div className="exchange-info-actions">
        <button type="submit" disabled={saving}>{saving ? 'Publishing…' : 'Publish changes'}</button>
        <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  )
}

export default function ExchangeProgramInfo() {
  const session = useAppStore((state) => state.session)
  const theme = useAppStore((state) => state.theme)
  const userId = session?.user?.id
  const [coordinatorId, setCoordinatorId] = useState(null)
  const [content, setContent] = useState(defaults)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [published, setPublished] = useState(false)
  const canEdit = Boolean(userId && coordinatorId === userId)

  useEffect(() => {
    let active = true
    supabase.from('exchange_program_info').select('*').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (!active) return
      if (data) setContent({ ...defaults, ...data })
      setLoadError(Boolean(error))
      setLoaded(true)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!userId) return undefined
    let active = true
    supabase.rpc('is_ku_coordinator').then(({ data }) => {
      if (active) setCoordinatorId(data === true ? userId : null)
    })
    return () => { active = false }
  }, [userId])

  return (
    <main className="exchange-info ascend-home" data-theme={theme}>
      <div className="exchange-info-inner">
        <header className="exchange-info-hero">
          <h1>About KU Exchange</h1>
          <p>Student Exchange Program · Kuwait University</p>
        </header>

        {canEdit && loaded && !loadError && !editing && (
          <div className="exchange-info-actions">
            <button type="button" onClick={() => { setEditing(true); setPublished(false) }}><InfoIcon name="edit" /> Edit program information</button>
          </div>
        )}
        {published && <p role="status">Program information published.</p>}
        {canEdit && editing && (
          <ProgramEditor
            key={userId}
            content={content}
            onCancel={() => setEditing(false)}
            onSave={(data) => { setContent(data); setEditing(false); setPublished(true) }}
          />
        )}

        <div className="exchange-info-grid">
          <section className="exchange-info-card">
            <h2>Student Exchange team</h2>
            <p>{content.team_description}</p>
            <ul className="exchange-team-list">
              {[
                { name: content.director_name, title: 'Program Director', email: content.director_email },
                { name: content.assistant_name, title: 'Director Assistant for SEP Student Affairs', email: content.assistant_email, phone: content.assistant_phone },
                ...content.additional_contacts,
              ].filter((member) => member.name).map(({ name, title, email, phone }, index) => (
                <li key={index} className="exchange-member" style={{ '--delay': Math.min(index, 5) * 55 + 'ms' }}>
                  <span aria-hidden="true" className="exchange-monogram">
                    {name.replace(/^(dr|ms|mr|mrs)\.?\s+/i, '').trim().split(/\s+/).filter((_, i, words) => i === 0 || i === words.length - 1).map((word) => Array.from(word)[0]).join('').toUpperCase()}
                  </span>
                  <h3>{name}</h3>
                  <p>{title}</p>
                  {(email || phone) && <div className="exchange-member-links">
                    {email && <a href={`mailto:${email}`}><InfoIcon name="email" />{email}</a>}
                    {phone && <>
                      <a href={`tel:${phone}`}><InfoIcon name="phone" />{phone}</a>
                      <a href={`https://wa.me/${phone.replace(/\D/g, '')}`} aria-label={`Message ${name} on WhatsApp`}><InfoIcon name="whatsapp" />WhatsApp</a>
                    </>}
                  </div>}
                </li>
              ))}
            </ul>
            <a href={programUrl}>Official Student Exchange Program</a>
            <div className="exchange-info-social">
              {[content.program_instagram, content.college_instagram].map((handle, index) => (
                <a key={index} href={`https://www.instagram.com/${handle}/`} aria-label={`Instagram: @${handle}`}><InfoIcon name="instagram" /><span>@{handle}</span></a>
              ))}
            </div>
          </section>

          <section className="exchange-info-card">
            <h2>College of Business Administration</h2>
            <p>CBA is Kuwait University’s College of Business Administration.</p>
            <a href={content.college_url}>Visit the official CBA website</a>
            <div className="exchange-info-accreditation">
              <img src={`${import.meta.env.BASE_URL}images/letter-aacsb.png`} alt="AACSB accredited" />
              <p>{content.accreditation}</p>
            </div>
            <h3>Mailing address</h3>
            <address>{content.mailing_address}</address>
          </section>
        </div>
        {content.updated_at && <p className="exchange-info-updated"><InfoIcon name="edit" /><span>Last modified</span> <time dateTime={content.updated_at}>{formatDateTime(content.updated_at)} (Kuwait time)</time></p>}
        {canEdit && loadError && <p role="status">Saved program information is unavailable.</p>}
      </div>
    </main>
  )
}
