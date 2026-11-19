import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './DateField.css'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const pad = (number) => String(number).padStart(2, '0')

function parseValue(type, value) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:T(\d{2}):(\d{2}))?/.exec(value || '')
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: type === 'month' ? 1 : Number(match[3] || 1),
    hour: Number(match[4] || 9),
    minute: Number(match[5] || 0),
  }
}

function formatValue(type, { year, month, day, hour, minute }) {
  const date = `${year}-${pad(month + 1)}`
  if (type === 'month') return date
  if (type === 'date') return `${date}-${pad(day)}`
  return `${date}-${pad(day)}T${pad(hour)}:${pad(minute)}`
}

function dayKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

// Text on the accent has to stay readable whether the page accent is a light teal or a
// dark amber, so the ink colour is picked from the accent's brightness.
function inkFor(color) {
  const probe = document.createElement('span')
  probe.style.color = color
  document.body.appendChild(probe)
  const channels = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
  probe.remove()
  const [red, green, blue] = channels.map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  // Contrast against #fffaf0 (luminance about 0.96) and #06121f (about 0.006).
  return 1.01 / (luminance + 0.05) > (luminance + 0.05) / 0.056 ? '#fffaf0' : '#06121f'
}

const usesCustomPicker = () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches

export default function DateField({ type = 'date', value = '', min, max, disabled, readOnly, className = '', ...inputProps }) {
  const inputRef = useRef(null)
  const shellRef = useRef(null)
  const popoverRef = useRef(null)
  const [custom] = useState(usesCustomPicker)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(type === 'month' ? 'months' : 'days')
  const [cursor, setCursor] = useState(() => parseValue(type, value) || todayParts())
  const [position, setPosition] = useState(null)
  const [theme, setTheme] = useState({})
  const [focusPicker, setFocusPicker] = useState(false)
  const dialogId = useId()
  const selected = parseValue(type, value)

  const openPicker = (moveFocus) => {
    if (disabled || readOnly) return
    const accent = getComputedStyle(inputRef.current).getPropertyValue('--date-accent').trim() || '#00d4ff'
    setTheme({ '--picker-accent': accent, '--picker-accent-ink': inkFor(accent) })
    setCursor(parseValue(type, value) || todayParts())
    setView(type === 'month' ? 'months' : 'days')
    setFocusPicker(moveFocus)
    setOpen(true)
  }

  const close = (returnFocus) => {
    setOpen(false)
    if (returnFocus) inputRef.current?.focus()
  }

  // Writes through the real input so each form's existing onChange handler sees an ordinary
  // change event with event.target.name and event.target.value.
  const commit = (parts) => {
    const input = inputRef.current
    const next = parts ? formatValue(type, parts) : ''
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, next)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  useLayoutEffect(() => {
    if (!open) return undefined
    const place = () => {
      const field = shellRef.current.getBoundingClientRect()
      const width = popoverRef.current?.offsetWidth || 320
      const height = popoverRef.current?.offsetHeight || 360
      const below = field.bottom + 8
      const top = below + height > window.innerHeight - 8 && field.top - height - 8 > 8 ? field.top - height - 8 : below
      const left = Math.min(Math.max(8, field.left), window.innerWidth - width - 8)
      setPosition({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, view])

  useEffect(() => {
    if (!open) return undefined
    const closeOutside = (event) => {
      if (!shellRef.current.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  useEffect(() => {
    if (!open || !focusPicker) return
    popoverRef.current?.querySelector('[data-focus-target="true"]')?.focus()
  }, [open, focusPicker, view, cursor])

  if (!custom) {
    return <input ref={inputRef} type={type} value={value} min={min} max={max} disabled={disabled} readOnly={readOnly} className={className} {...inputProps} />
  }

  const minKey = min ? min.slice(0, type === 'month' ? 7 : 10) : null
  const maxKey = max ? max.slice(0, type === 'month' ? 7 : 10) : null
  const outOfRange = (key) => (minKey && key < minKey.slice(0, key.length)) || (maxKey && key > maxKey.slice(0, key.length))
  const today = todayParts()

  const pickDay = (year, month, day) => {
    const parts = { ...(selected || cursor), year, month, day }
    commit(parts)
    if (type === 'date') close(true)
    else setCursor(parts)
  }

  const pickMonth = (month) => {
    if (type === 'month') {
      commit({ ...cursor, month, day: 1 })
      close(true)
      return
    }
    setCursor({ ...cursor, month })
    setView('days')
  }

  const pickTime = (field, amount) => {
    const parts = { ...(selected || cursor), [field]: amount }
    setCursor(parts)
    if (selected) commit(parts)
  }

  const moveCursor = (days) => {
    const date = new Date(cursor.year, cursor.month, cursor.day + days)
    setCursor({ ...cursor, year: date.getFullYear(), month: date.getMonth(), day: date.getDate() })
  }

  const shiftMonth = (months) => {
    const date = new Date(cursor.year, cursor.month + months, 1)
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    setCursor({ ...cursor, year: date.getFullYear(), month: date.getMonth(), day: Math.min(cursor.day, lastDay) })
  }

  const onGridKey = (event) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (view === 'days' && moves[event.key]) moveCursor(moves[event.key])
    else if (view !== 'days' && moves[event.key]) {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[event.key]
      if (view === 'months') setCursor({ ...cursor, month: (cursor.month + step + 12) % 12 })
      else setCursor({ ...cursor, year: cursor.year + step })
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const direction = event.key === 'PageUp' ? -1 : 1
      if (view === 'days') shiftMonth(direction)
      else setCursor({ ...cursor, year: cursor.year + direction * (view === 'years' ? 12 : 1) })
    } else return
    event.preventDefault()
    setFocusPicker(true)
  }

  const onPopoverKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'Tab') {
      const focusable = [...popoverRef.current.querySelectorAll('button:not([disabled])')].filter((button) => button.tabIndex !== -1)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  const yearStart = cursor.year - (cursor.year % 12)
  const title = view === 'days' ? `${MONTHS[cursor.month]} ${cursor.year}` : view === 'months' ? String(cursor.year) : `${yearStart} – ${yearStart + 11}`
  const step = (direction) => {
    if (view === 'days') shiftMonth(direction)
    else setCursor({ ...cursor, year: cursor.year + direction * (view === 'years' ? 12 : 1) })
  }

  const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay()
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(cursor.year, cursor.month, index - firstWeekday + 1)
    return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() }
  })
  const minutes = [...new Set([...Array.from({ length: 12 }, (_, index) => index * 5), (selected || cursor).minute])].sort((a, b) => a - b)
  const shown = selected || cursor

  const popover = open && createPortal(
    <div
      ref={popoverRef}
      className={`date-picker date-picker--${type}`}
      id={dialogId}
      role="dialog"
      aria-label={type === 'month' ? 'Choose a month' : type === 'date' ? 'Choose a date' : 'Choose a date and time'}
      style={{ ...theme, top: position?.top ?? -9999, left: position?.left ?? -9999 }}
      onKeyDown={onPopoverKey}
      // Keeps focus in the field while picking with the mouse, so the form's blur
      // validation does not flash an error before the new value lands.
      onMouseDown={(event) => { if (!focusPicker) event.preventDefault() }}
    >
      <div className="date-picker__main">
        <div className="date-picker__header">
          <button type="button" className="date-picker__nav" onClick={() => step(-1)} aria-label="Previous">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
          </button>
          <button
            type="button"
            className="date-picker__title"
            // Not disabled in the year view: a focused button that becomes disabled drops
            // focus out of the picker, and Escape would stop working.
            onClick={() => { if (view !== 'years') setView(view === 'days' ? 'months' : 'years') }}
            aria-disabled={view === 'years'}
            aria-label={view === 'years' ? title : `${title}, choose ${view === 'days' ? 'month' : 'year'}`}
          >
            {title}
            {view !== 'years' && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>}
          </button>
          <button type="button" className="date-picker__nav" onClick={() => step(1)} aria-label="Next">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>

        <div className="date-picker__body" key={`${view}-${view === 'days' ? `${cursor.year}-${cursor.month}` : view === 'months' ? cursor.year : yearStart}`} onKeyDown={onGridKey}>
          {view === 'days' && (
            <div className="date-picker__days" role="group" aria-label={title}>
              {WEEKDAYS.map((weekday) => <span className="date-picker__weekday" key={weekday} aria-hidden="true">{weekday}</span>)}
              {days.map(({ year, month, day }) => {
                const key = dayKey(year, month, day)
                const isCursor = year === cursor.year && month === cursor.month && day === cursor.day
                const isSelected = selected && key === dayKey(selected.year, selected.month, selected.day)
                return (
                  <button
                    type="button"
                    key={key}
                    className={[
                      'date-picker__day',
                      month !== cursor.month && 'date-picker__day--outside',
                      key === dayKey(today.year, today.month, today.day) && 'date-picker__day--today',
                      isSelected && 'date-picker__day--selected',
                    ].filter(Boolean).join(' ')}
                    tabIndex={isCursor ? 0 : -1}
                    data-focus-target={isCursor}
                    disabled={outOfRange(key)}
                    aria-pressed={Boolean(isSelected)}
                    aria-label={new Date(year, month, day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    onClick={() => pickDay(year, month, day)}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          )}

          {view === 'months' && (
            <div className="date-picker__grid">
              {MONTHS.map((name, month) => {
                const isSelected = selected && selected.year === cursor.year && selected.month === month
                return (
                  <button
                    type="button"
                    key={name}
                    className={`date-picker__cell${isSelected ? ' date-picker__cell--selected' : ''}${today.year === cursor.year && today.month === month ? ' date-picker__cell--today' : ''}`}
                    tabIndex={cursor.month === month ? 0 : -1}
                    data-focus-target={cursor.month === month}
                    disabled={outOfRange(`${cursor.year}-${pad(month + 1)}`)}
                    aria-pressed={Boolean(isSelected)}
                    onClick={() => pickMonth(month)}
                  >
                    {name.slice(0, 3)}
                  </button>
                )
              })}
            </div>
          )}

          {view === 'years' && (
            <div className="date-picker__grid">
              {Array.from({ length: 12 }, (_, index) => yearStart + index).map((year) => (
                <button
                  type="button"
                  key={year}
                  className={`date-picker__cell${selected?.year === year ? ' date-picker__cell--selected' : ''}${today.year === year ? ' date-picker__cell--today' : ''}`}
                  tabIndex={cursor.year === year ? 0 : -1}
                  data-focus-target={cursor.year === year}
                  disabled={outOfRange(String(year))}
                  aria-pressed={selected?.year === year}
                  onClick={() => { setCursor({ ...cursor, year }); setView('months') }}
                >
                  {year}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="date-picker__footer">
          <button
            type="button"
            className="date-picker__link"
            disabled={outOfRange(type === 'month' ? `${today.year}-${pad(today.month + 1)}` : dayKey(today.year, today.month, today.day))}
            onClick={() => {
              if (type === 'month') pickMonth(today.month)
              else pickDay(today.year, today.month, today.day)
              setCursor({ ...cursor, ...today })
            }}
          >
            {type === 'month' ? 'This month' : 'Today'}
          </button>
          <button type="button" className="date-picker__link date-picker__link--muted" onClick={() => { commit(null); close(true) }}>Clear</button>
          {type === 'datetime-local' && <button type="button" className="date-picker__done" onClick={() => close(true)}>Done</button>}
        </div>
      </div>

      {type === 'datetime-local' && (
        <div className="date-picker__time" aria-label="Time">
          <span className="date-picker__time-label">Time</span>
          <div className="date-picker__time-columns">
            <TimeColumn label="Hour" values={HOURS} current={shown.hour} onPick={(hour) => pickTime('hour', hour)} />
            <TimeColumn label="Minute" values={minutes} current={shown.minute} onPick={(minute) => pickTime('minute', minute)} />
          </div>
          <span className="date-picker__time-value">{pad(shown.hour)}:{pad(shown.minute)}</span>
        </div>
      )}
    </div>,
    document.body,
  )

  return (
    <span ref={shellRef} className={`date-field date-field--custom${open ? ' date-field--open' : ''}`}>
      <input
        ref={inputRef}
        type={type}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        readOnly={readOnly}
        className={className}
        {...inputProps}
        // The browser's own picker is replaced on laptops; typing into the field still works.
        onClick={(event) => {
          event.preventDefault()
          if (!open) openPicker(false)
          inputProps.onClick?.(event)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) close(false)
          if (event.key === 'Tab' && open) setOpen(false)
          if ((event.key === 'ArrowDown' && event.altKey) || event.key === 'F4') {
            event.preventDefault()
            openPicker(true)
          }
          inputProps.onKeyDown?.(event)
        }}
      />
      <button
        type="button"
        className="date-field__trigger"
        aria-label={type === 'month' ? 'Open month picker' : 'Open calendar'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        disabled={disabled || readOnly}
        onClick={() => (open ? close(true) : openPicker(true))}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
          <path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2" />
        </svg>
      </button>
      {popover}
    </span>
  )
}

function TimeColumn({ label, values, current, onPick }) {
  const listRef = useRef(null)
  useEffect(() => {
    const active = listRef.current?.querySelector('[aria-pressed="true"]')
    if (active) listRef.current.scrollTop = active.offsetTop - listRef.current.clientHeight / 2 + active.offsetHeight / 2
  }, [current])
  return (
    <div className="date-picker__time-column" ref={listRef} role="group" aria-label={label}>
      {values.map((number) => (
        <button type="button" key={number} aria-pressed={number === current} className={number === current ? 'is-active' : undefined} onClick={() => onPick(number)}>
          {pad(number)}
        </button>
      ))}
    </div>
  )
}

function todayParts() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate(), hour: 9, minute: 0 }
}
