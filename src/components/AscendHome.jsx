import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PlanetScene from './PlanetScene'
import StudentEligibilityChecker from './StudentEligibilityChecker'
import VisaChecker from './VisaChecker'
import { useAppStore } from '../stores/appStore'
import './AscendHome.css'

const features = [
  {
    icon: 'globe',
    title: 'Explore partner universities',
    description: 'Browse available exchange destinations and learn about partner universities.',
    href: '/partners',
    link: 'View partner universities',
  },
  {
    icon: 'check',
    title: 'Check your eligibility',
    description: 'Use your academic details and English proficiency to check the current outbound criteria.',
    href: '#eligibility',
    link: 'Check eligibility',
  },
  {
    icon: 'document',
    title: 'Prepare your application',
    description: 'Review the exchange application requirements and start your application when ready.',
    href: '/portal/outbound-application',
    link: 'Start an application',
  },
]

function scrollToSection(event, id) {
  event.preventDefault()
  document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
}

function Icon({ name }) {
  const paths = {
    globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z" /></>,
    check: <><path d="M20 6 9 17l-5-5" /><circle cx="12" cy="12" r="10" /></>,
    document: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    arrow: <><path d="M5 12h14" strokeWidth="2" /><path d="m12 5 7 7-7 7" strokeWidth="2" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function usePageMotion() {
  useEffect(() => {
    const revealItems = [...document.querySelectorAll('[data-reveal]')]
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion || !('IntersectionObserver' in window)) {
      revealItems.forEach((element) => element.classList.add('in'))
      return undefined
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('in')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' })
    revealItems.forEach((element) => observer.observe(element))

    let lenis
    let disposed = false
    let frameId
    import('https://unpkg.com/lenis@1.3.23/dist/lenis.mjs')
      .then(({ default: Lenis }) => {
        if (disposed || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        lenis = new Lenis({ duration: 1.15, smoothWheel: true, touchMultiplier: 1.5 })
        const raf = (time) => {
          lenis?.raf(time)
          frameId = window.requestAnimationFrame(raf)
        }
        frameId = window.requestAnimationFrame(raf)
      })
      .catch((error) => console.error('Unable to load smooth scrolling.', error))

    return () => {
      disposed = true
      observer.disconnect()
      if (frameId) window.cancelAnimationFrame(frameId)
      lenis?.destroy()
    }
  }, [])
}

export default function AscendHome() {
  const canvasRef = useRef(null)
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const session = useAppStore((state) => state.session)
  const [planetStatus, setPlanetStatus] = useState('loading')
  const [navOpen, setNavOpen] = useState(false)
  const onPlanetReady = useCallback(() => setPlanetStatus('ready'), [])
  const onPlanetError = useCallback(() => setPlanetStatus('error'), [])
  usePageMotion()

  const closeNav = () => setNavOpen(false)

  return (
    <div className="ascend-home" id="top" data-theme={theme}>
      <PlanetScene canvasRef={canvasRef} theme={theme} onReady={onPlanetReady} onError={onPlanetError} />
      {planetStatus !== 'ready' && (
        <div className={`ascend-loader${planetStatus === 'error' ? ' ascend-loader--error' : ''}`} role={planetStatus === 'error' ? 'alert' : 'status'} aria-live="polite">
          <span className="ascend-loader-mark" aria-hidden="true">KU</span>
          <span className="ascend-loader-spinner" aria-hidden="true" />
          <p>{planetStatus === 'error' ? 'The globe could not be loaded.' : 'Preparing your world'}</p>
          {planetStatus === 'error' && <button type="button" onClick={() => window.location.reload()}>Try again</button>}
        </div>
      )}
      <div className={`ascend-page${planetStatus === 'ready' ? ' ascend-page--ready' : ''}`}>
        <div className="exchange-nav-shell">
          <nav className="exchange-nav" aria-label="Main navigation">
            <a className="exchange-brand" href="#top" onClick={(event) => scrollToSection(event, 'top')} aria-label="KU Exchange home">
              <img src={`${import.meta.env.BASE_URL}images/kulogodarkmode.png`} alt="" />
              <span><strong>KU Exchange</strong><small>Student Exchange Program</small></span>
            </a>
            <button
              className="exchange-menu-toggle"
              type="button"
              aria-expanded={navOpen}
              aria-controls="exchange-nav-links"
              onClick={() => setNavOpen((open) => !open)}
            >
              {navOpen ? 'Close menu' : 'Menu'}
            </button>
            <div className={`exchange-nav-links${navOpen ? ' exchange-nav-links--open' : ''}`} id="exchange-nav-links">
              <a href="#features" onClick={(event) => { scrollToSection(event, 'features'); closeNav() }}>Program</a>
              <a href="#eligibility" onClick={(event) => { scrollToSection(event, 'eligibility'); closeNav() }}>Eligibility</a>
              <a href="#visa-advisory" onClick={(event) => { scrollToSection(event, 'visa-advisory'); closeNav() }}>Visa advisory</a>
              <Link to="/partners" onClick={closeNav}>Universities</Link>
            </div>
            <div className="exchange-nav-actions">
              <button
                className="ascend-theme-toggle"
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
                {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
              {session
                ? <Link className="exchange-nav-portal" to="/portal">My portal</Link>
                : <Link className="exchange-nav-portal" to="/auth/signin">Sign in</Link>}
            </div>
          </nav>
        </div>
        <header className="exchange-hero">
          <div className="exchange-hero-inner">
            <span className="exchange-eyebrow" data-reveal>KU College of Business Administration</span>
            <h1 className="exchange-hero-title" data-reveal style={{ '--rd': '80ms' }}>Your next chapter<br />starts <em>abroad</em></h1>
            <p className="exchange-hero-sub" data-reveal style={{ '--rd': '160ms' }}>
              Discover exchange opportunities, prepare for your journey, and explore the world with Kuwait University.
            </p>
            <div className="exchange-hero-actions" data-reveal style={{ '--rd': '240ms' }}>
              <Link className="ascend-button ascend-button-primary" to="/partners">Explore universities <Icon name="arrow" /></Link>
              <a className="ascend-button ascend-button-outline" href="#eligibility" onClick={(event) => scrollToSection(event, 'eligibility')}>Check eligibility</a>
            </div>
            <a className="exchange-scroll-link" href="#features" onClick={(event) => scrollToSection(event, 'features')} data-reveal style={{ '--rd': '320ms' }}>
              Explore the program <span aria-hidden="true">↓</span>
            </a>
          </div>
        </header>

        <main>
          <section className="exchange-section exchange-features" id="features">
            <header className="exchange-section-head" data-reveal>
              <span className="exchange-eyebrow">Plan your exchange</span>
              <h2>Start with the essentials</h2>
              <p>Explore partner universities, review the outbound criteria, and prepare for travel from one place.</p>
            </header>
            <div className="exchange-feature-grid">
              {features.map(({ icon, title, description, href, link }, index) => (
                <article className="exchange-feature-card" key={title} data-reveal style={{ '--rd': `${index * 80}ms` }}>
                  <span className="exchange-feature-icon"><Icon name={icon} /></span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  {href.startsWith('/')
                    ? <Link to={href}>{link}<Icon name="arrow" /></Link>
                    : <a href={href} onClick={(event) => scrollToSection(event, 'eligibility')}>{link}<Icon name="arrow" /></a>}
                </article>
              ))}
            </div>
          </section>

          <section className="exchange-section exchange-tool-section" id="eligibility" data-reveal>
            <div className="exchange-section-head">
              <span className="exchange-eyebrow">Before you apply</span>
              <h2>Student eligibility checker</h2>
              <p>Answer a few questions to check your academic and English proficiency eligibility for outbound exchange.</p>
            </div>
            <div className="exchange-tool-card">
              <StudentEligibilityChecker />
            </div>
            <p className="exchange-disclaimer">This is a preliminary check based on the current outbound application criteria. It does not guarantee selection or placement.</p>
          </section>

          <section className="exchange-section exchange-tool-section" id="visa-advisory" data-reveal>
            <div className="exchange-section-head">
              <span className="exchange-eyebrow">Prepare for travel</span>
              <h2>Visa advisory</h2>
              <p>Check preliminary study visa guidance for your nationality and selected destination.</p>
            </div>
            <div className="exchange-tool-card exchange-visa-card">
              <VisaChecker />
            </div>
          </section>

          <section className="exchange-bottom-cta" data-reveal>
            <span className="exchange-eyebrow">Ready to explore?</span>
            <h2>Find the destination that fits your goals.</h2>
            <p>Browse the universities available through the KU exchange program.</p>
            <Link className="ascend-button ascend-button-primary" to="/partners">View partner universities <Icon name="arrow" /></Link>
          </section>
        </main>

        <footer className="exchange-footer">
          <a className="exchange-brand" href="#top" onClick={(event) => scrollToSection(event, 'top')}>
            <img src={`${import.meta.env.BASE_URL}images/kulogodarkmode.png`} alt="" />
            <span><strong>KU Exchange</strong><small>Kuwait University · College of Business Administration</small></span>
          </a>
          <div className="exchange-footer-links">
            <Link to="/partners">Partner universities</Link>
            <Link to="/auth/signin">Sign in</Link>
          </div>
          <p>© {new Date().getFullYear()} Kuwait University College of Business Administration</p>
        </footer>
      </div>
    </div>
  )
}
