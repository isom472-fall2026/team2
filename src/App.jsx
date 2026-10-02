import { useState, useEffect } from 'react'
import ErdPage from './ErdPage'
import './App.css'

function Navbar() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="navbar__brand">
        <svg className="navbar__logo-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="navbar__brand-text">KU Exchange</span>
      </div>

      <button
        className="navbar__toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label="Toggle navigation"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none">
          <path d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <ul className={`navbar__links ${isOpen ? 'navbar__links--open' : ''}`} role="list">
        <li>
          <a
            href="https://www.ku.edu.kw"
            target="_blank"
            rel="noopener noreferrer"
            className="navbar__link"
          >
            {/* University building icon */}
            <svg className="navbar__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 21h18M9 21V7l3-4 3 4v14M9 11h6M5 21V11l-2 2M19 21V11l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Kuwait University
          </a>
        </li>
        <li>
          <a
            href="#partner-universities"
            className="navbar__link"
          >
            {/* Handshake / partnership icon */}
            <svg className="navbar__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M16 8l-4-4-4 4M12 4v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 13l-3 3a2 2 0 0 0 2.83 2.83L11 15.66M16 13l3 3a2 2 0 0 1-2.83 2.83L13 15.66M11 15.66l1 1 1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Partner Universities
          </a>
        </li>
        <li>
          <a
            href="#incoming-application"
            className="navbar__link navbar__link--cta"
          >
            {/* Incoming arrow icon */}
            <svg className="navbar__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 20h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Incoming Student
          </a>
        </li>
        <li>
          <a
            href="#outgoing-application"
            className="navbar__link navbar__link--cta navbar__link--cta-alt"
          >
            {/* Outgoing arrow icon */}
            <svg className="navbar__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 21V9m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 4h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Outgoing Student
          </a>
        </li>
      </ul>
    </nav>
  )
}

function HeroBackground() {
  return (
    <div className="hero-bg" aria-hidden="true">
      <div className="hero-orb hero-orb--1" />
      <div className="hero-orb hero-orb--2" />
      <div className="hero-orb hero-orb--3" />
      <div className="hero-orb hero-orb--4" />
      <div className="hero-orb hero-orb--5" />
      {/* Animated grid lines */}
      <div className="hero-grid" />
    </div>
  )
}

function HeroSection() {
  return (
    <section className="hero-section" aria-label="Student Exchange Program">
      <HeroBackground />
      <div className="hero-section__inner">
        <div className="hero-section__badge">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          Kuwait University College of Business Administration
        </div>
        <img
          src={`${import.meta.env.BASE_URL}images/exchangelogoeng.png`}
          alt="Student Exchange Program"
          className="hero-section__logo"
        />
        <p className="hero-section__subtitle">
          Broaden your academic horizons by studying at one of our world-class partner
          universities — or welcome international scholars to our campus.
        </p>
        <div className="hero-section__actions">
          <a href="#incoming-application" className="btn btn--primary">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="20" height="20">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Apply as Incoming Student
          </a>
          <a href="#outgoing-application" className="btn btn--secondary">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="20" height="20">
              <path d="M12 21V9m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 4h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Apply as Outgoing Student
          </a>
        </div>
      </div>
    </section>
  )
}


const stats = [
  { value: '25+', label: 'Partner Universities' },
  { value: '12', label: 'Countries' },
  { value: '500+', label: 'Alumni Exchanged' },
  { value: '2', label: 'Semesters per Year' },
]

function StatsBar() {
  return (
    <div className="stats-bar" aria-label="Program at a glance">
      {stats.map(({ value, label }) => (
        <div key={label} className="stats-bar__item">
          <span className="stats-bar__value">{value}</span>
          <span className="stats-bar__label">{label}</span>
        </div>
      ))}
    </div>
  )
}

const infoCards = [
  {
    id: 'eligibility',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    title: 'Eligibility',
    body: 'Open to undergraduate and postgraduate students who have completed at least one academic year at Kuwait University with a minimum CGPA of 2.5.',
  },
  {
    id: 'duration',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Duration',
    body: 'Exchange periods last one full semester or one academic year, aligned with the host institution\'s academic calendar.',
  },
  {
    id: 'credits',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Credit Transfer',
    body: 'Courses taken abroad are reviewed by the Academic Council and — when equivalent — transferred directly to your KU transcript.',
  },
  {
    id: 'financial',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Financial Support',
    body: 'Selected students may be eligible for KU travel grants and fee waivers. Tuition is paid to Kuwait University; partner tuition is waived under bilateral agreements.',
  },
]

function InfoCards() {
  return (
    <section className="info-cards" aria-labelledby="program-details-heading">
      <h2 id="program-details-heading" className="section-heading">Program Details</h2>
      <div className="info-cards__grid">
        {infoCards.map(({ id, icon, title, body }) => (
          <article key={id} className="info-card">
            <div className="info-card__icon">{icon}</div>
            <h3 className="info-card__title">{title}</h3>
            <p className="info-card__body">{body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

const partners = [
  { name: 'University of Edinburgh', country: 'United Kingdom', flag: '🇬🇧' },
  { name: 'Université Paris-Sorbonne', country: 'France', flag: '🇫🇷' },
  { name: 'University of Toronto', country: 'Canada', flag: '🇨🇦' },
  { name: 'Seoul National University', country: 'South Korea', flag: '🇰🇷' },
  { name: 'University of Melbourne', country: 'Australia', flag: '🇦🇺' },
  { name: 'Maastricht University', country: 'Netherlands', flag: '🇳🇱' },
]

function PartnerUniversities() {
  return (
    <section id="partner-universities" className="partners" aria-labelledby="partners-heading">
      <h2 id="partners-heading" className="section-heading">Partner Universities</h2>
      <p className="section-subheading">
        We collaborate with leading institutions across the globe.
      </p>
      <ul className="partners__grid" role="list">
        {partners.map(({ name, country, flag }) => (
          <li key={name} className="partner-card">
            <span className="partner-card__flag" aria-hidden="true">{flag}</span>
            <div>
              <p className="partner-card__name">{name}</p>
              <p className="partner-card__country">{country}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ApplicationCTA() {
  return (
    <section className="apply-cta" aria-labelledby="apply-cta-heading">
      <h2 id="apply-cta-heading" className="apply-cta__heading">Ready to Begin?</h2>
      <p className="apply-cta__body">
        Choose the application that matches your situation and follow the guided steps.
        Our International Relations Office is available to help throughout the process.
      </p>
      <div className="apply-cta__cards">
        <div id="incoming-application" className="apply-card apply-card--incoming">
          <div className="apply-card__icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h3 className="apply-card__title">Incoming Student</h3>
          <p className="apply-card__description">
            You are an international student wishing to study at Kuwait University for a
            semester or a full academic year.
          </p>
          <a href="#incoming-form" className="btn btn--primary btn--full">
            Start Incoming Application
          </a>
        </div>

        <div id="outgoing-application" className="apply-card apply-card--outgoing">
          <div className="apply-card__icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 21V9m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 4h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h3 className="apply-card__title">Outgoing Student</h3>
          <p className="apply-card__description">
            You are a KU student wishing to study abroad at one of our partner universities
            for a semester or a full academic year.
          </p>
          <a href="#outgoing-form" className="btn btn--secondary btn--full">
            Start Outgoing Application
          </a>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer__content">
        <div className="footer__section">
          <h4 className="footer__heading">Main Links</h4>
          <ul className="footer__links">
            <li><a href="#" className="footer__link">Contact Us</a></li>
          </ul>
        </div>
        <div className="footer__section">
          <h4 className="footer__heading">Legacy Documents</h4>
          <ul className="footer__links">
            <li><a href={`${import.meta.env.BASE_URL}docs/proposal.html`} className="footer__link">Proposal</a></li>
            <li><a href="#erd" className="footer__link">Schema and ERD</a></li>
          </ul>
        </div>
      </div>
      <p className="footer__text">
        © {new Date().getFullYear()} Kuwait University · College of Business Administration ·
        International Relations Office
      </p>
    </footer>
  )
}

function App() {
  const [currentHash, setCurrentHash] = useState(window.location.hash)

  useEffect(() => {
    const onHashChange = () => setCurrentHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return (
    <>
      <Navbar />
      <main>
        {currentHash === '#erd' ? (
          <ErdPage />
        ) : (
          <>
            <HeroSection />
            <StatsBar />
            <InfoCards />
            <PartnerUniversities />
            <ApplicationCTA />
          </>
        )}
      </main>
      <Footer />
    </>
  )
}

export default App
