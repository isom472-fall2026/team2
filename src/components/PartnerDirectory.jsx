import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import {
  partnerUniversityAirports,
  partnerUniversityCoordinates,
  partnerUniversityFlags,
  partnerUniversityWebsites,
} from '../partnerUniversities'

const PartnerUniversityMap = lazy(() => import('./PartnerUniversityMap'))

export default function PartnerUniversitiesRoute() {
  const [universities, setUniversities] = useState([])
  const [homeUniversity, setHomeUniversity] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedUniversityId, setSelectedUniversityId] = useState(null)
  const [showAirport, setShowAirport] = useState(false)

  useEffect(() => {
    let isCurrent = true
    const loadUniversities = async () => {
      let result = await supabase
        .from('partneruniversity')
        .select('university_id, name, logo_url, details, latitude, longitude, airport_name, airport_code, airport_latitude, airport_longitude')
        .eq('available', true)
        .order('name')
      // Until the #114 migration has run, the airport columns do not exist yet.
      if (result.error?.message.includes('airport')) {
        result = await supabase
          .from('partneruniversity')
          .select('university_id, name, logo_url, details, latitude, longitude')
          .eq('available', true)
          .order('name')
      }
      if (result.error?.message.includes('latitude') || result.error?.message.includes('longitude')) {
        result = await supabase
          .from('partneruniversity')
          .select('university_id, name, logo_url, details')
          .eq('available', true)
          .order('name')
      }
      if (!isCurrent) return
      if (result.error) setError(getDatabaseErrorMessage(result.error))
      else {
        const mappedUniversities = (result.data || []).map((university) => ({
          ...university,
          latitude: university.latitude ?? partnerUniversityCoordinates[university.name]?.[0],
          longitude: university.longitude ?? partnerUniversityCoordinates[university.name]?.[1],
        }))
        const kuwaitUniversity = mappedUniversities.find((university) => university.university_id === 4)
        const availableUniversities = mappedUniversities.filter((university) => university.university_id !== 4)
        setHomeUniversity(kuwaitUniversity || {
          university_id: 4,
          name: 'Kuwait University',
          details: 'Kuwait University is the home institution for this exchange directory.',
        })
        setUniversities(availableUniversities)
      }
      setIsLoading(false)
    }
    loadUniversities()

    return () => {
      isCurrent = false
    }
  }, [])

  // Universities added from the portal carry their airport in the database; the original
  // ones still use the researched list above.
  const airports = useMemo(() => ({
    ...partnerUniversityAirports,
    ...Object.fromEntries(universities
      .filter((university) => university.airport_code && university.airport_latitude != null && university.airport_longitude != null)
      .map((university) => [university.name, {
        name: university.airport_name,
        code: university.airport_code,
        coordinates: [Number(university.airport_longitude), Number(university.airport_latitude)],
      }])),
  }), [universities])
  const selectedUniversity = universities.find((university) => university.university_id === selectedUniversityId)
  const detailsUniversity = selectedUniversity || homeUniversity
  const selectUniversity = useCallback((universityId) => {
    setSelectedUniversityId(universityId)
    setShowAirport(false)
  }, [])

  return (
    <section className="partner-directory" aria-labelledby="partner-directory-heading">
      <div className="partner-directory__intro">
        <span className="auth-card__eyebrow">Global connections</span>
        <h1 id="partner-directory-heading">Our partner universities</h1>
        <p>Explore the institutions that make exchange opportunities around the world possible.</p>
      </div>
      {isLoading && <p className="partner-directory__status">Loading partner universities...</p>}
      {error && <p className="partner-directory__status partner-directory__status--error" role="alert">{error}</p>}
      {!isLoading && !error && universities.length === 0 && (
        <p className="partner-directory__status">No partner universities are available yet.</p>
      )}
      {!isLoading && !error && universities.length > 0 && (
        <>
          <div className="partner-directory__viewport">
            <div className="partner-directory__track">
              {[...universities, ...universities].map((university, index) => (
                <a
                  className="partner-directory__university"
                  href={partnerUniversityWebsites[university.name]}
                  target="_blank"
                  rel="noopener noreferrer"
                  key={`${university.university_id}-${index}`}
                  aria-hidden={index >= universities.length}
                  tabIndex={index >= universities.length ? -1 : undefined}
                >
                  <div className="partner-directory__logo">
                    {university.logo_url ? (
                      <img src={university.logo_url} alt="" />
                    ) : (
                      <span aria-hidden="true">{university.name.charAt(0)}</span>
                    )}
                  </div>
                  <p>{university.name}</p>
                </a>
              ))}
            </div>
          </div>
          <section className="partner-directory__browser" aria-label="Partner university directory">
            <aside className="partner-directory__list">
              <h2>Partner university directory</h2>
              <div className="partner-directory__list-scroll">
                {universities.map((university) => (
                  <button
                    className={university.university_id === selectedUniversityId ? 'partner-directory__list-item partner-directory__list-item--active' : 'partner-directory__list-item'}
                    type="button"
                    key={university.university_id}
                    onClick={() => selectUniversity(university.university_id)}
                  >
                    <span className="partner-directory__list-flag" aria-hidden="true">{partnerUniversityFlags[university.name] || '🌐'}</span>
                    {university.name}
                  </button>
                ))}
              </div>
            </aside>
            <div className="partner-directory__details">
              {detailsUniversity && (
                <>
                  <div className="partner-directory__details-copy">
                    <span className="auth-card__eyebrow">{selectedUniversity ? 'Selected partner' : 'Home'}</span>
                    <div className="partner-directory__selected-logo">
                      {detailsUniversity.logo_url ? (
                        <img src={detailsUniversity.logo_url} alt="" />
                      ) : (
                        <span aria-hidden="true">{detailsUniversity.name.charAt(0)}</span>
                      )}
                    </div>
                    <h2>{detailsUniversity.name}</h2>
                    <p>{detailsUniversity.details || 'University details are not available yet.'}</p>
                    {selectedUniversity && (
                      <div className="partner-directory__details-actions">
                        <button className="btn btn--secondary" type="button" onClick={() => setShowAirport((isVisible) => !isVisible)}>
                          {showAirport ? 'Hide airport recommendation' : 'Recommended arrival airport'}
                        </button>
                        {showAirport && (
                          <p className="partner-directory__airport" role="status">
                            {airports[selectedUniversity.name]?.name || 'Airport information is not available'} ({airports[selectedUniversity.name]?.code || '—'})
                            {airports[selectedUniversity.name]?.route && (
                              <span>{airports[selectedUniversity.name].route}</span>
                            )}
                            {airports[selectedUniversity.name]?.distanceKm != null && (
                              <span>
                                {airports[selectedUniversity.name].distanceKm} km by road · approximately {airports[selectedUniversity.name].driveMinutes} minutes by car
                              </span>
                            )}
                          </p>
                        )}
                        <a className="btn btn--secondary" href={partnerUniversityWebsites[selectedUniversity.name]} target="_blank" rel="noopener noreferrer">
                          Visit university website
                        </a>
                      </div>
                    )}
                  </div>
                  <Suspense fallback={<div className="partner-directory__map-shell" />}>
                    <PartnerUniversityMap
                      airports={airports}
                      universities={universities}
                      homeUniversity={homeUniversity}
                      selectedUniversity={selectedUniversity}
                      onSelect={selectUniversity}
                      onResetSelection={() => {
                        setSelectedUniversityId(null)
                        setShowAirport(false)
                      }}
                      showAirport={showAirport}
                    />
                  </Suspense>
                </>
              )}
            </div>
          </section>
        </>
      )}
    </section>
  )
}
