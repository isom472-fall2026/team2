import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import './VisaChecker.css'

const isoCountryCodes = `AD AE AF AG AI AL AM AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GD GE GF GG GI GL GM GN GP GQ GR GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW`.split(' ')
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
const frequentlyApplyingCodes = ['KW', 'BH', 'QA', 'AE', 'SA', 'OM', 'LB', 'PS', 'SY', 'JO', 'EG', 'IR', 'SD']
const flagImageUrl = (code) => `https://flagcdn.com/w80/${code.toLowerCase()}.png`
const nationalityOptions = isoCountryCodes
  .filter((code) => code !== 'XK' && code !== 'IL')
  .map((code) => ({
    code,
    name: code === 'AE' ? 'UAE' : code === 'PS' ? 'Palestinian Territories' : regionNames.of(code),
  }))
const frequentlyApplyingOptions = frequentlyApplyingCodes.map((code) =>
  nationalityOptions.find((option) => option.code === code),
)
const otherNationalityOptions = nationalityOptions
  .filter((option) => !frequentlyApplyingCodes.includes(option.code))
  .sort((first, second) => first.name.localeCompare(second.name))
const passportCoverCache = new Map()

function loadPassportCover(code) {
  if (!passportCoverCache.has(code)) {
    const url = `https://img.passportindex.org/countries/${code.toLowerCase()}.png`
    const request = new Promise((resolve) => {
      const image = new Image()
      image.referrerPolicy = 'no-referrer'
      image.onload = () => resolve(image)
      image.onerror = () => resolve(null)
      image.src = url
    }).then((image) => {
      if (!image) passportCoverCache.delete(code)
      return image
    })
    passportCoverCache.set(code, request)
  }

  return passportCoverCache.get(code)
}

const passportIndexSlugs = {
  KW: 'kuwait', BH: 'bahrain', QA: 'qatar', AE: 'united-arab-emirates',
  SA: 'saudi-arabia', OM: 'oman', LB: 'lebanon', PS: 'palestinian-territories',
  SY: 'syria', JO: 'jordan', EG: 'egypt', IR: 'iran', SD: 'sudan',
}

const destinationIsoCodes = {
  Australia: 'AU', France: 'FR', Germany: 'DE', India: 'IN', Italy: 'IT',
  Netherlands: 'NL', 'South Korea': 'KR', Spain: 'ES', Switzerland: 'CH',
  Taiwan: 'TW', 'United States': 'US', 'United States of America': 'US',
}

const destinationMapNames = {
  'United States': 'USA',
  'United States of America': 'USA',
}

const destinationVisaSources = {
  Australia: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500',
  France: 'https://france-visas.gouv.fr/en/student',
  Germany: 'https://www.auswaertiges-amt.de/en/visa-service/visa-navigator-2489244',
  India: 'https://indianvisaonline.gov.in/evisa/tvoa.html',
  Italy: 'https://vistoperitalia.esteri.it/home/en',
  Netherlands: 'https://ind.nl/en/residence-permits/study',
  'South Korea': 'https://www.visa.go.kr/openPage.do?MENU_ID=10101',
  Spain: 'https://www.exteriores.gob.es/en/ServiciosAlCiudadano/Paginas/Servicios-consulares.aspx',
  Switzerland: 'https://www.sem.admin.ch/sem/en/home/themen/einreise/visumantragsformular.html',
  Taiwan: 'https://www.boca.gov.tw/lp-166-2-xCat-3.html',
  'United States': 'https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html',
}

const entryRules = {
  Australia: { default: 'evisa' },
  France: { default: 'visa-required', overrides: { AE: 'visa-free' } },
  Germany: { default: 'visa-required', overrides: { AE: 'visa-free' } },
  India: {
    default: 'evisa',
    overrides: { AE: 'evisa-on-arrival', LB: 'visa-required', SY: 'visa-required', EG: 'visa-required', IR: 'visa-required', SD: 'visa-required' },
  },
  Italy: { default: 'visa-required', overrides: { AE: 'visa-free' } },
  Netherlands: { default: 'visa-required', overrides: { AE: 'visa-free' } },
  'South Korea': {
    default: 'evisa',
    overrides: { KW: 'visa-free', BH: 'visa-free', QA: 'visa-free', AE: 'visa-free', SA: 'visa-free', OM: 'visa-free' },
  },
  Spain: { default: 'visa-required', overrides: { AE: 'visa-free' } },
  Switzerland: { default: 'visa-required', overrides: { AE: 'visa-free' } },
  Taiwan: {
    default: 'visa-required',
    overrides: { KW: 'evisa', BH: 'evisa', QA: 'evisa', AE: 'evisa', SA: 'evisa', OM: 'evisa' },
  },
  'United States': {
    default: 'visa-required',
    overrides: { QA: 'eta', PS: 'restricted', SY: 'restricted', IR: 'restricted', SD: 'restricted' },
  },
}

const entryStatusDetails = {
  'visa-required': { label: 'Visa required for a short stay (up to 3 months)', color: 'required' },
  evisa: { label: 'eVisa required for a short stay (up to 3 months)', color: 'required' },
  'evisa-on-arrival': { label: 'eVisa or visa on arrival required for a short stay (up to 3 months)', color: 'required' },
  'visa-free': { label: 'Visa not required for a short stay (up to 3 months)', color: 'not-required' },
  eta: { label: 'ETA required for a short stay (up to 3 months)', color: 'not-required' },
  restricted: { label: 'Entry restricted for a short stay (up to 3 months)', color: 'required' },
}

const worldBoundaryUrl = 'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson'
let worldBoundaryRequest

function loadWorldBoundaries() {
  if (!worldBoundaryRequest) {
    worldBoundaryRequest = fetch(worldBoundaryUrl, { referrerPolicy: 'no-referrer' })
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null)
  }
  return worldBoundaryRequest
}

function getOuterRings(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.map((polygon) => polygon[0]).filter((ring) => ring?.length)
}

function getRingArea(ring) {
  return Math.abs(ring.reduce((sum, [longitude, latitude], index) => {
    const [nextLongitude, nextLatitude] = ring[(index + 1) % ring.length]
    return sum + longitude * nextLatitude - nextLongitude * latitude
  }, 0))
}

function getRingBounds(ring) {
  const longitudes = ring.map(([longitude]) => longitude)
  const latitudes = ring.map(([, latitude]) => latitude)
  return {
    minLongitude: Math.min(...longitudes),
    maxLongitude: Math.max(...longitudes),
    minLatitude: Math.min(...latitudes),
    maxLatitude: Math.max(...latitudes),
  }
}

function getDestinationMapPaths(features, selectedName) {
  const selectedFeature = features.find(({ properties }) => properties.name === selectedName)
  if (!selectedFeature) return []

  const selectedRings = getOuterRings(selectedFeature.geometry)
  const largestSelectedRing = selectedRings.reduce((largest, ring) =>
    getRingArea(ring) > getRingArea(largest) ? ring : largest, selectedRings[0])
  if (!largestSelectedRing) return []

  const targetBounds = getRingBounds(largestSelectedRing)
  const longitudePadding = Math.max(4, (targetBounds.maxLongitude - targetBounds.minLongitude) * 0.4)
  const latitudePadding = Math.max(3, (targetBounds.maxLatitude - targetBounds.minLatitude) * 0.4)
  const bounds = {
    minLongitude: targetBounds.minLongitude - longitudePadding,
    maxLongitude: targetBounds.maxLongitude + longitudePadding,
    minLatitude: targetBounds.minLatitude - latitudePadding,
    maxLatitude: targetBounds.maxLatitude + latitudePadding,
  }
  const width = 260
  const height = 170
  const padding = 12
  const scale = Math.min(
    (width - padding * 2) / (bounds.maxLongitude - bounds.minLongitude),
    (height - padding * 2) / (bounds.maxLatitude - bounds.minLatitude),
  )
  const drawnWidth = (bounds.maxLongitude - bounds.minLongitude) * scale
  const drawnHeight = (bounds.maxLatitude - bounds.minLatitude) * scale
  const offsetX = (width - drawnWidth) / 2
  const offsetY = (height - drawnHeight) / 2

  return features.flatMap(({ properties, geometry }) => {
    const isDestination = properties.name === selectedName
    return getOuterRings(geometry)
      .filter((ring) => {
        const ringBounds = getRingBounds(ring)
        return ringBounds.maxLongitude >= bounds.minLongitude
          && ringBounds.minLongitude <= bounds.maxLongitude
          && ringBounds.maxLatitude >= bounds.minLatitude
          && ringBounds.minLatitude <= bounds.maxLatitude
      })
      .map((ring, index) => {
        const path = ring.map(([longitude, latitude], pointIndex) => {
          const x = offsetX + (longitude - bounds.minLongitude) * scale
          const y = offsetY + (bounds.maxLatitude - latitude) * scale
          return `${pointIndex === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
        }).join(' ') + ' Z'
        return { id: `${properties.name}-${index}`, name: properties.name, path, isDestination }
      })
  })
}

function openExternalSource(url) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export default function VisaChecker() {
  const [nationality, setNationality] = useState('')
  const [passportMatches, setPassportMatches] = useState('')
  const [destination, setDestination] = useState('')
  const [passportCoverStatus, setPassportCoverStatus] = useState('idle')
  const [destinationCountries, setDestinationCountries] = useState([])
  const [destinationsLoaded, setDestinationsLoaded] = useState(false)
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(false)
  const [destinationError, setDestinationError] = useState('')
  const [destinationLoadAttempt, setDestinationLoadAttempt] = useState(0)
  const [destinationMapStatus, setDestinationMapStatus] = useState('idle')
  const [destinationMapPaths, setDestinationMapPaths] = useState([])
  const passportCoverContainer = useRef(null)
  const selectedNationality = nationalityOptions.find(({ code }) => code === nationality)
  const destinationCode = destinationIsoCodes[destination]
  const entryRule = entryRules[destination]
  const entryStatus = entryRule?.overrides?.[nationality] || entryRule?.default
  const entryStatusDetail = entryStatusDetails[entryStatus]
  const passportIndexUrl = passportIndexSlugs[nationality]
    ? `https://www.passportindex.org/passport/${passportIndexSlugs[nationality]}/`
    : null

  useEffect(() => {
    if (!nationality) {
      setPassportCoverStatus('idle')
      passportCoverContainer.current?.replaceChildren()
      return
    }

    let cancelled = false
    setPassportCoverStatus('loading')
    passportCoverContainer.current?.replaceChildren()
    loadPassportCover(nationality).then((image) => {
      if (!cancelled) {
        if (image) {
          image.alt = `${selectedNationality.name} passport cover`
          passportCoverContainer.current?.replaceChildren(image)
        }
        setPassportCoverStatus(image ? 'loaded' : 'unavailable')
      }
    })

    return () => {
      cancelled = true
      passportCoverContainer.current?.replaceChildren()
    }
  }, [nationality, selectedNationality])

  useEffect(() => {
    if (passportMatches !== 'yes' || destinationsLoaded) return

    let isCurrent = true
    setIsLoadingDestinations(true)
    setDestinationError('')
    supabase
      .from('partneruniversity')
      .select('location, country(name)')
      .eq('available', true)
      .then(({ data, error }) => {
        if (!isCurrent) return
        if (error) {
          setDestinationError(error.message)
        } else {
          const countries = [...new Set((data || [])
            .map(({ country }) => country?.name)
            .filter((name) => name && name.trim().toLowerCase() !== 'kuwait'))]
            .sort((first, second) => first.localeCompare(second))
          setDestinationCountries(countries)
          setDestinationsLoaded(true)
        }
        setIsLoadingDestinations(false)
      })

    return () => {
      isCurrent = false
    }
  }, [passportMatches, destinationsLoaded, destinationLoadAttempt])

  useEffect(() => {
    if (!destination) {
      setDestinationMapStatus('idle')
      setDestinationMapPaths([])
      return
    }

    let isCurrent = true
    setDestinationMapStatus('loading')
    setDestinationMapPaths([])
    loadWorldBoundaries().then((world) => {
      if (!isCurrent) return
      const mapName = destinationMapNames[destination] || destination
      const paths = world ? getDestinationMapPaths(world.features, mapName) : []
      setDestinationMapPaths(paths)
      setDestinationMapStatus(paths.some(({ isDestination }) => isDestination) ? 'loaded' : 'unavailable')
    })

    return () => {
      isCurrent = false
    }
  }, [destination])

  return (
    <section className="visa-advisory" aria-labelledby="visa-advisory-heading">
      <h2 id="visa-advisory-heading" className="section-heading">Visa Requirement Advisory</h2>
      <p className="section-subheading">
        Check preliminary study visa guidance for a partner destination.
      </p>
      <div className="visa-advisory__form">
        <label className="visa-advisory__field">
          Nationality
          <select
            value={nationality}
            onChange={(event) => {
              const nextNationality = event.target.value
              setNationality(nextNationality)
              setPassportMatches('')
              setDestination('')
              setPassportCoverStatus(nextNationality ? 'loading' : 'idle')
              passportCoverContainer.current?.replaceChildren()
            }}
            autoComplete="country-name"
          >
            <option value="">Select a nationality</option>
            <optgroup label="Frequently applying">
              {frequentlyApplyingOptions.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
            </optgroup>
            <optgroup label="All other nationalities">
              {otherNationalityOptions.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
            </optgroup>
          </select>
        </label>
      </div>
      {nationality && (
        <figure className="visa-advisory__passport" aria-live="polite">
          <div className="visa-advisory__passport-frame">
            {passportCoverStatus === 'loading' && <p>Loading passport cover...</p>}
            <div ref={passportCoverContainer} />
            {passportCoverStatus === 'unavailable' && (
              <p>Passport cover image is unavailable for {selectedNationality.name}.</p>
            )}
          </div>
        </figure>
      )}
      {nationality && passportCoverStatus === 'loaded' && (
        <fieldset className="visa-advisory__passport-confirm">
          <legend>Does this look like your passport?</legend>
          <label>
            <input
              type="radio"
              name="passport-match"
              value="yes"
              checked={passportMatches === 'yes'}
              onChange={(event) => {
                setPassportMatches(event.target.value)
                setDestination('')
              }}
            />
            Yes
          </label>
          <label>
            <input
              type="radio"
              name="passport-match"
              value="no"
              checked={passportMatches === 'no'}
              onChange={(event) => {
                setPassportMatches(event.target.value)
                setDestination('')
              }}
            />
            No
          </label>
        </fieldset>
      )}
      {passportMatches === 'no' && (
        <p className="visa-advisory__notice" role="status">
          Please check with the KU Exchange Student Office before continuing.
        </p>
      )}
      {passportMatches === 'yes' && (
        <div className="visa-advisory__form visa-advisory__follow-up">
          <label className="visa-advisory__field">
            Destination country
            <select
              value={destination}
              onChange={(event) => {
                setDestination(event.target.value)
              }}
              disabled={isLoadingDestinations || Boolean(destinationError)}
            >
              <option value="">
                {isLoadingDestinations ? 'Loading destinations...' : 'Select a destination country'}
              </option>
              {destinationCountries.map((country) => <option key={country} value={country}>{country}</option>)}
            </select>
          </label>
          {destinationError && (
            <div className="visa-advisory__destination-error" role="alert">
              <p>Destinations could not be loaded: {destinationError}</p>
              <button type="button" onClick={() => setDestinationLoadAttempt((attempt) => attempt + 1)}>
                Try again
              </button>
            </div>
          )}
        </div>
      )}
      {passportMatches === 'yes' && nationality && destination && entryStatusDetail && (
        <div className="visa-advisory__result" aria-live="polite">
          <div className="visa-advisory__journey" aria-label={`${selectedNationality.name} passport to ${destination}`}>
            <span className="visa-advisory__journey-point">
              <img src={flagImageUrl(nationality)} alt={`${selectedNationality.name} flag`} referrerPolicy="no-referrer" />
              <span>{selectedNationality.name}</span>
            </span>
            <span className="visa-advisory__journey-arrow" aria-hidden="true">→</span>
            <span className="visa-advisory__journey-point">
              <img src={flagImageUrl(destinationCode)} alt={`${destination} flag`} referrerPolicy="no-referrer" />
              <span>{destination}</span>
            </span>
          </div>
          <p className={`visa-advisory__badge visa-advisory__badge--${entryStatusDetail.color}`}>
            {entryStatusDetail.label}
          </p>
          <aside className="visa-advisory__study-warning" role="note">
            <strong>Study stays longer than 3 months:</strong> These destinations generally require separate long-stay study authorization, such as a student visa or residence permit, even if short-stay visitor entry is visa-free. The application route varies by country and may involve an embassy, an eVisa, or an in-country permit. Check the official guidance below before making plans.
          </aside>
          <figure className={`visa-advisory__country-map visa-advisory__country-map--${entryStatusDetail.color}`}>
            {destinationMapStatus === 'loading' && <p>Loading destination map...</p>}
            {destinationMapStatus === 'loaded' && (
              <svg viewBox="0 0 260 170" role="img" aria-label={`${destination} highlighted ${entryStatusDetail.color === 'required' ? 'red' : 'green'} with surrounding countries`}>
                {destinationMapPaths.map(({ id, name, path, isDestination }) => (
                  <path
                    key={id}
                    d={path}
                    className={isDestination ? 'visa-advisory__country-shape--selected' : 'visa-advisory__country-shape--neighbor'}
                    aria-label={name}
                  />
                ))}
              </svg>
            )}
            {destinationMapStatus === 'unavailable' && <p>Destination map is unavailable.</p>}
            <figcaption>{destination}</figcaption>
          </figure>
          <div className="visa-advisory__source-actions">
            <button
              className="visa-advisory__source-button visa-advisory__source-button--primary"
              type="button"
              onClick={() => openExternalSource(destinationVisaSources[destination])}
              aria-label={`Open official ${destination} government visa guidance in a new tab`}
            >
              Check official {destination} government visa guidance
            </button>
            {passportIndexUrl && (
              <button
                className="visa-advisory__source-button"
                type="button"
                onClick={() => openExternalSource(passportIndexUrl)}
              >
                Compare entry requirements at Passport Index
              </button>
            )}
          </div>
          <p className="visa-advisory__disclaimer">
            This is a general visitor-entry assessment for a short stay of up to 3 months, not permission to study. The maximum permitted stay can be shorter and varies by passport and destination; confirm the exact limit with the official source.
          </p>
        </div>
      )}
    </section>
  )
}