import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './AscendTheme.css'
import './ExchangeNav.css'

export default function ExchangeNav({ theme, links, actions, onHomeClick, site = false }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  // Picking a destination closes the mobile menu; the theme toggle keeps it open so the
  // visitor can see the change without reopening it.
  const closeOnPick = (event) => {
    if (event.target.closest('a, button:not(.ascend-theme-toggle)')) setOpen(false)
  }

  const brand = (
    <>
      <span className="exchange-brand-logo" data-theme={theme} aria-hidden="true">
        <img className="exchange-brand-logo--light" src={`${import.meta.env.BASE_URL}images/kulogolightmode.png`} alt="" />
        <img className="exchange-brand-logo--dark" src={`${import.meta.env.BASE_URL}images/kulogodarkmode.png`} alt="" />
      </span>
      <span><strong>KU Exchange</strong><small>Student Exchange Program</small></span>
    </>
  )

  return (
    <div className={`exchange-nav-shell${site ? ' exchange-nav-shell--site' : ''}`} data-theme={site ? theme : undefined}>
      <nav className="exchange-nav" aria-label="Main navigation">
        {onHomeClick
          ? <a className="exchange-brand" href="#top" onClick={onHomeClick} aria-label="KU Exchange home">{brand}</a>
          : <Link className="exchange-brand" to="/" aria-label="KU Exchange home">{brand}</Link>}
        <button
          className="exchange-menu-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="exchange-nav-menu"
          onClick={() => setOpen((isOpen) => !isOpen)}
        >
          <span className="exchange-menu-icon" aria-hidden="true"><span /><span /><span /></span>
          {open ? 'Close' : 'Menu'}
        </button>
        <div className={`exchange-nav-menu${open ? ' exchange-nav-menu--open' : ''}`} id="exchange-nav-menu" onClick={closeOnPick}>
          <div className="exchange-nav-links">{links}</div>
          <div className="exchange-nav-actions">{actions}</div>
        </div>
      </nav>
    </div>
  )
}
