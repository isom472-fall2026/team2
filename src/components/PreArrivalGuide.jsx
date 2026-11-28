import { useEffect, useId, useState } from 'react'
import { getCycles } from '../referenceData'
import { guideCopy as copy, guideSections } from '../preArrivalGuideContent'
import './PreArrivalGuide.css'
import { formatDate } from '../dates'

const iconPaths = {
  plane: 'm22 2-7 20-4-9-9-4 20-7ZM22 2 11 13',
  passport: 'M5 3h13a2 2 0 0 1 2 2v15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 14h15M3 18a1 1 0 0 1 2-1M9 7h6M12 5v8M8 9h8M8 9a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
  home: 'm3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',
  bus: 'M5 17h14V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v12Zm0-8h14M8 13h.01M16 13h.01M7 17v3M17 17v3M9 6h6',
  calendar: 'M4 5h16v16H4V5Zm3-3v6M17 2v6M4 10h16M8 14h2M14 14h2M8 17h2',
  book: 'M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1m0-15c4-3 8-2 10-1v15c-4-2-7-1-10 1V5Z',
  campus: 'm2 8 10-5 10 5-10 5L2 8Zm4 3v7c4 3 8 3 12 0v-7M22 8v8',
  sun: 'M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5',
  search: 'M3 10a7 7 0 1 0 14 0 7 7 0 1 0-14 0m12 5 6 6',
  chevron: 'm6 9 6 6 6-6',
  close: 'm6 6 12 12M6 18 18 6',
  mail: 'M3 5h18v14H3V5Zm0 1 9 7 9-7',
  phone: 'M8 3 5 2 2 5c0 9 8 17 17 17l3-3-1-3-5-2-2 2a14 14 0 0 1-6-6l2-2-2-5Z',
  chat: 'M21 11a9 9 0 0 1-9 9 9 9 0 0 1-4-1l-6 2 2-6a9 9 0 1 1 17-4ZM8 11h.01M12 11h.01M16 11h.01',
  sparkle: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
}

function GuideIcon({ name, className = '' }) {
  return <svg className={`arrival-guide__icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[name]} /></svg>
}

function formatSemesterDate(value) {
  return formatDate(value, copy.cycle.unset)
}

function arrivalDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return null
  return new Date(Date.parse(value) - 7 * 24 * 60 * 60 * 1000).toISOString()
}

function matchesSearch(section, query) {
  const text = [section.title, section.subtitle, ...section.blocks.map((block) => [
    block.title, block.text, ...(block.items || []),
    ...(block.table ? [block.table.caption, ...block.table.headings, ...block.table.rows.flat()] : []),
    ...(block.contacts || []).map((contact) => [contact.label, contact.email, contact.phone, contact.whatsapp].join(' ')),
  ].filter(Boolean).join(' ')), ...(section.contact ? [copy.contact.address, copy.contact.number, copy.contact.whatsapp] : [])].join(' ')
  return text.toLowerCase().includes(query)
}

function defaultCycle(cycles) {
  const now = Date.now()
  const upcoming = cycles.filter((cycle) => Date.parse(cycle.cycle_start) >= now)
    .sort((left, right) => Date.parse(left.cycle_start) - Date.parse(right.cycle_start))
  const active = cycles.filter((cycle) => Date.parse(cycle.cycle_start) <= now && Date.parse(cycle.cycle_end) >= now)
    .sort((left, right) => Date.parse(right.cycle_start) - Date.parse(left.cycle_start))
  return upcoming[0] || active[0] || cycles[0]
}

function OfficeLinks({ compact = false }) {
  const contact = copy.contact
  return (
    <div className={`arrival-guide__contacts${compact ? ' arrival-guide__contacts--compact' : ''}`}>
      <a href={`mailto:${contact.address}`}><GuideIcon name="mail" /><span>{contact.address}</span></a>
      <a href={contact.tel} aria-label={`${contact.phone}: ${contact.number}`}><GuideIcon name="phone" /><span>{contact.number}</span></a>
      <a href={contact.chat} target="_blank" rel="noopener noreferrer"><GuideIcon name="chat" /><span>{contact.whatsapp}</span></a>
    </div>
  )
}

function GuideBlock({ block }) {
  return (
    <div className={`arrival-guide__block${block.tone ? ` arrival-guide__block--${block.tone}` : ''}`}>
      <h4>{block.tone && <GuideIcon name="sparkle" />}{block.title}</h4>
      {block.text && <p>{block.text}</p>}
      {block.items && <ul className="arrival-guide__chips">{block.items.map((item) => <li key={item}>{item}</li>)}</ul>}
      {block.table && (
        <div className="arrival-guide__table-wrap" tabIndex={0} role="region" aria-label={block.table.caption}>
          <table>
            <caption className="arrival-guide__sr-only">{block.table.caption}</caption>
            <thead><tr>{block.table.headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
            <tbody>{block.table.rows.map(([level, ...cells]) => <tr key={level}><th scope="row">{level}</th>{cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {block.contacts && <div className="arrival-guide__records">{block.contacts.map((contact) => (
        <div key={contact.label}>
          <strong>{contact.label}</strong>
          <a href={`mailto:${contact.email}`}><GuideIcon name="mail" />{contact.email}</a>
          <a href={contact.tel}><GuideIcon name="phone" />{contact.phone}</a>
          {contact.chat && <a href={contact.chat} target="_blank" rel="noopener noreferrer"><GuideIcon name="chat" />{copy.contact.whatsapp} · {contact.whatsapp}</a>}
        </div>
      ))}</div>}
    </div>
  )
}

export default function PreArrivalGuide() {
  const id = useId()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(['visa'])
  const [cycles, setCycles] = useState([])
  const [selection, setSelection] = useState('')
  const [load, setLoad] = useState({ loading: true, error: false })
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let current = true
    getCycles().then(({ data, error }) => {
      if (!current) return
      setCycles(data || [])
      setLoad({ loading: false, error: Boolean(error) })
    })
    return () => { current = false }
  }, [retry])

  const needle = query.trim().toLowerCase()
  const sections = guideSections.filter((section) => matchesSearch(section, needle))
  const cycle = cycles.find(({ id: cycleId }) => String(cycleId) === selection) || defaultCycle(cycles)
  const allExpanded = sections.length > 0 && sections.every(({ id: sectionId }) => expanded.includes(sectionId))

  const search = (value) => {
    setQuery(value)
    const text = value.trim().toLowerCase()
    setExpanded(text ? guideSections.filter((section) => matchesSearch(section, text)).map((section) => section.id) : ['visa'])
  }

  return (
    <section className="arrival-guide" lang="en" dir="ltr" aria-labelledby={`${id}-title`}>
      <header className="arrival-guide__hero">
        <div className="arrival-guide__hero-copy">
          <span className="arrival-guide__eyebrow">{copy.eyebrow}</span>
          <h2 id={`${id}-title`}>{copy.title}</h2>
          <p>{copy.intro}</p>
          <span className="arrival-guide__language"><GuideIcon name="book" />{copy.language}</span>
        </div>
        <div className="arrival-guide__ticket" aria-hidden="true">
          <div className="arrival-guide__ticket-route"><span>···</span><span className="arrival-guide__flight-line" /><GuideIcon name="plane" /></div>
          <strong>{copy.destination}</strong><span>{copy.destinationLabel}</span>
          <div className="arrival-guide__barcode" />
        </div>
      </header>

      <div className="arrival-guide__essentials">
        {copy.essentials.map((item) => <div key={item.value}><span className="arrival-guide__essential-icon"><GuideIcon name={item.icon} /></span><div><strong>{item.value}</strong><span>{item.label}</span></div></div>)}
      </div>

      <section className="arrival-guide__semester" aria-labelledby={`${id}-semester`}>
        <div className="arrival-guide__semester-heading"><div><span className="arrival-guide__eyebrow"><GuideIcon name="calendar" />{copy.cycle.title}</span><h3 id={`${id}-semester`}>{cycle ? `${cycle.semester} ${cycle.academic_year}` : copy.cycle.label}</h3></div>
          {!load.loading && !load.error && cycles.length > 0 && <select aria-label={copy.cycle.label} value={String(cycle.id)} onChange={(event) => setSelection(event.target.value)}>{cycles.map((item) => <option key={item.id} value={item.id}>{item.semester} {item.academic_year}</option>)}</select>}
        </div>
        {load.loading ? <p role="status">{copy.cycle.loading}</p> : load.error ? <div role="alert"><p>{copy.cycle.error}</p><button type="button" className="arrival-guide__text-button" onClick={() => { setLoad({ loading: true, error: false }); setRetry((count) => count + 1) }}>{copy.cycle.retry}</button></div> : !cycle ? <p>{copy.cycle.empty}</p> : <><dl className="arrival-guide__dates"><div className="arrival-guide__arrive"><dt>{copy.cycle.arrival}</dt><dd>{formatSemesterDate(arrivalDate(cycle.cycle_start))}</dd></div><div><dt>{copy.cycle.starts}</dt><dd>{formatSemesterDate(cycle.cycle_start)}</dd></div><div><dt>{copy.cycle.ends}</dt><dd>{formatSemesterDate(cycle.cycle_end)}</dd></div></dl><p className="arrival-guide__date-note">{copy.cycle.note}</p></>}
      </section>

      <div className="arrival-guide__browse">
        <label className="arrival-guide__search"><GuideIcon name="search" /><span className="arrival-guide__sr-only">{copy.search.label}</span><input type="search" value={query} onChange={(event) => search(event.target.value)} placeholder={copy.search.placeholder} />{query && <button type="button" aria-label={copy.search.clear} onClick={() => search('')}><GuideIcon name="close" /></button>}</label>
        <div className="arrival-guide__browse-tools"><span role="status" aria-live="polite">{needle ? `${sections.length} ${copy.search.results}` : copy.search.all}</span><button className="arrival-guide__text-button" type="button" disabled={!sections.length} onClick={() => setExpanded(allExpanded ? [] : sections.map((section) => section.id))}>{allExpanded ? copy.search.collapse : copy.search.expand}</button></div>
      </div>

      <div className="arrival-guide__sections">
        {sections.map((section) => {
          const open = expanded.includes(section.id)
          return <article key={section.id} className={`arrival-guide__section arrival-guide__section--${section.accent}`}>
            <h3><button className="arrival-guide__section-toggle" type="button" id={`${id}-${section.id}-heading`} aria-expanded={open} aria-controls={`${id}-${section.id}`} onClick={() => setExpanded((current) => open ? current.filter((item) => item !== section.id) : [...current, section.id])}><span className="arrival-guide__section-icon"><GuideIcon name={section.icon} /></span><span className="arrival-guide__section-label"><strong>{section.title}</strong><span>{section.subtitle}</span></span><GuideIcon name="chevron" className="arrival-guide__chevron" /></button></h3>
            <div id={`${id}-${section.id}`} hidden={!open} role="region" aria-labelledby={`${id}-${section.id}-heading`} className="arrival-guide__section-content">
              {section.blocks.map((block) => <GuideBlock key={block.title} block={block} />)}
              {section.contact && <OfficeLinks compact />}
            </div>
          </article>
        })}
        {sections.length === 0 && <div className="arrival-guide__empty"><GuideIcon name="search" /><h3>{copy.search.emptyTitle}</h3><p>{copy.search.empty}</p><button type="button" className="arrival-guide__text-button" onClick={() => search('')}>{copy.search.reset}</button></div>}
      </div>

      <footer className="arrival-guide__help"><span className="arrival-guide__help-icon"><GuideIcon name="chat" /></span><div><h3>{copy.contact.title}</h3><p>{copy.contact.text}</p><OfficeLinks /></div></footer>
      <p className="arrival-guide__credit">{copy.credit}<GuideIcon name="plane" /></p>
    </section>
  )
}
