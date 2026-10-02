import React from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'

export default function ErdPage() {
  return (
    <section className="info-cards" aria-labelledby="erd-heading" style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h1 id="erd-heading" className="section-heading" style={{ marginTop: '2rem' }}>Database Schema & ERD</h1>
      <p className="section-subheading" style={{ color: "white" }}>
        Entity-Relationship Diagram illustrating the core data structures of the KU Exchange platform. You can scroll to zoom and drag to pan around the image.
      </p>

      <div className="info-card" style={{ width: '100%', maxWidth: '1000px', display: 'flex', justifyContent: 'center', padding: '1rem', background: 'var(--bg-card-alt)', overflow: 'hidden' }}>
        <TransformWrapper
          initialScale={1}
          minScale={0.5}
          maxScale={4}
          centerOnInit={true}
        >
          <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
            <img
              src={`${import.meta.env.BASE_URL}images/ERD.png`}
              alt="Entity-Relationship Diagram"
              style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>

      <div style={{ marginTop: '3rem', marginBottom: '2rem' }}>
        <a href="#" className="btn btn--secondary">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="20" height="20">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Home
        </a>
      </div>
    </section>
  )
}
