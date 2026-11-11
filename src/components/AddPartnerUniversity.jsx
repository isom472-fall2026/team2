import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_ACCESS_TOKEN } from '../../js/config.js'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { forgetPartnerUniversities, getCountries } from '../referenceData'
import './AddPartnerUniversity.css'

const LOGO_BUCKET = 'partner-university-logos'
const MAX_LOGO_BYTES = 2 * 1024 * 1024
const LOGO_EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg' }
const PIN_COLORS = { university: '#00d4ff', airport: '#f0a500' }

const emptyForm = {
  name: '',
  country: '',
  details: '',
  latitude: '',
  longitude: '',
  airportName: '',
  airportCode: '',
  airportLatitude: '',
  airportLongitude: '',
  logoSource: 'upload',
  logoUrl: '',
}

function textOf(value) {
  return value == null ? '' : String(value)
}

// An existing logo is kept as an image link, so saving without touching it leaves it as is.
function formFromUniversity(university) {
  return {
    name: university.name,
    country: textOf(university.location),
    details: textOf(university.details),
    latitude: textOf(university.latitude),
    longitude: textOf(university.longitude),
    airportName: textOf(university.airport_name),
    airportCode: textOf(university.airport_code),
    airportLatitude: textOf(university.airport_latitude),
    airportLongitude: textOf(university.airport_longitude),
    logoSource: university.logo_url ? 'url' : 'upload',
    logoUrl: textOf(university.logo_url),
  }
}

function generateUniversityId() {
  const randomValues = new Uint32Array(1)
  crypto.getRandomValues(randomValues)
  return 100000000 + (randomValues[0] % 900000000)
}

function coordinateError(value, min, max, label) {
  if (String(value).trim() === '') return `Pin the ${label} on the map or enter its coordinates.`
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) return `Must be a number between ${min} and ${max}.`
  return ''
}

function validateUniversityForm(form, logo) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'Enter the university name.'
  if (!form.country) errors.country = 'Choose the country.'
  const latitude = coordinateError(form.latitude, -90, 90, 'university')
  const longitude = coordinateError(form.longitude, -180, 180, 'university')
  if (latitude) errors.latitude = latitude
  if (longitude) errors.longitude = longitude
  if (!form.airportName.trim()) errors.airportName = 'Enter the name of the closest airport.'
  if (!/^[A-Z]{3}$/.test(form.airportCode)) errors.airportCode = 'Enter the three capital letters of the airport code, for example CDG.'
  const airportLatitude = coordinateError(form.airportLatitude, -90, 90, 'airport')
  const airportLongitude = coordinateError(form.airportLongitude, -180, 180, 'airport')
  if (airportLatitude) errors.airportLatitude = airportLatitude
  if (airportLongitude) errors.airportLongitude = airportLongitude
  if (form.logoSource === 'upload') {
    if (logo && !LOGO_EXTENSIONS[logo.type]) errors.logo = 'The logo must be a PNG or JPG image.'
    else if (logo && logo.size > MAX_LOGO_BYTES) errors.logo = 'The logo must be 2 MB or smaller.'
  } else if (form.logoUrl !== '') {
    // Same rule as the logo_url column: an http(s) address with no spaces, up to 255 characters.
    if (!/^https?:\/\/\S+$/i.test(form.logoUrl)) errors.logoUrl = 'Enter a full web address starting with https://, with no spaces.'
    else if (form.logoUrl.length > 255) errors.logoUrl = 'The logo address must be 255 characters or fewer.'
  }
  return errors
}

// ilike treats % and _ as wildcards, so they are escaped to match the name literally.
function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, '\\$&')
}

function duplicateNameMessage(name) {
  return `A partner university named "${name.trim()}" already exists. Use a different name.`
}

function FieldError({ id, message }) {
  return message ? <span className="add-university__field-error" id={id} role="alert">{message}</span> : null
}

function LocationPicker({ pins, placing, onPlace, startAt }) {
  const container = useRef(null)
  const map = useRef(null)
  const markers = useRef({})
  const placingRef = useRef(placing)
  const onPlaceRef = useRef(onPlace)
  // Only where the map first opens; later pin changes move the markers, not the view.
  const startRef = useRef(startAt)

  useEffect(() => {
    placingRef.current = placing
    onPlaceRef.current = onPlace
  }, [placing, onPlace])

  useEffect(() => {
    if (!container.current) return undefined
    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN
    map.current = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: startRef.current ? [startRef.current.longitude, startRef.current.latitude] : [20, 25],
      zoom: startRef.current ? 4 : 1.3,
    })
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.current.on('click', (event) => onPlaceRef.current(placingRef.current, event.lngLat))
    const resizeObserver = new ResizeObserver(() => map.current?.resize())
    resizeObserver.observe(container.current)
    const placedMarkers = markers.current
    return () => {
      resizeObserver.disconnect()
      Object.values(placedMarkers).forEach((marker) => marker.remove())
      // Forget the removed markers too, or a remounted map would think its pins are already placed.
      Object.keys(placedMarkers).forEach((kind) => delete placedMarkers[kind])
      map.current?.remove()
      map.current = null
    }
  }, [])

  // Pins follow the form, so typed coordinates and map clicks stay in step either way.
  useEffect(() => {
    if (!map.current) return
    Object.entries(pins).forEach(([kind, pin]) => {
      const marker = markers.current[kind]
      if (!pin) {
        marker?.remove()
        delete markers.current[kind]
        return
      }
      if (marker) {
        marker.setLngLat([pin.longitude, pin.latitude])
        return
      }
      const created = new mapboxgl.Marker({ color: PIN_COLORS[kind], draggable: true })
        .setLngLat([pin.longitude, pin.latitude])
        .addTo(map.current)
      created.on('dragend', () => onPlaceRef.current(kind, created.getLngLat()))
      markers.current[kind] = created
    })
  }, [pins])

  return <div className="add-university__map" ref={container} />
}

function pinFrom(latitude, longitude) {
  const lat = Number(latitude)
  const lng = Number(longitude)
  if (String(latitude).trim() === '' || String(longitude).trim() === '') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { latitude: lat, longitude: lng }
}

// Without a university this adds a new one (issue #114); with one it edits it (issue #138).
export default function AddPartnerUniversity({ university = null, onBack }) {
  const isEditing = Boolean(university)
  const [form, setForm] = useState(() => (university ? formFromUniversity(university) : emptyForm))
  const [startAt] = useState(() => (university ? pinFrom(university.latitude, university.longitude) : null))
  const [logo, setLogo] = useState(null)
  const [logoInputKey, setLogoInputKey] = useState(0)
  const [countries, setCountries] = useState([])
  const [countryError, setCountryError] = useState('')
  const [errors, setErrors] = useState({})
  const [placing, setPlacing] = useState('university')
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState({ error: '', saved: '' })

  useEffect(() => {
    let isCurrent = true
    getCountries().then(({ data, error }) => {
      if (!isCurrent) return
      if (error) setCountryError(getDatabaseErrorMessage(error))
      else setCountries(data || [])
    })
    return () => {
      isCurrent = false
    }
  }, [])

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
  }

  const placePin = (kind, lngLat) => {
    const latitude = lngLat.lat.toFixed(6)
    const longitude = lngLat.lng.toFixed(6)
    setForm((current) => (kind === 'airport'
      ? { ...current, airportLatitude: latitude, airportLongitude: longitude }
      : { ...current, latitude, longitude }))
    setErrors((current) => (kind === 'airport'
      ? { ...current, airportLatitude: '', airportLongitude: '' }
      : { ...current, latitude: '', longitude: '' }))
  }

  // Only one logo source is kept: switching clears the other, so a file and an address are
  // never both submitted.
  const chooseLogoSource = (logoSource) => {
    setForm((current) => ({ ...current, logoSource, logoUrl: logoSource === 'url' ? textOf(university?.logo_url) : '' }))
    setLogo(null)
    setLogoInputKey((key) => key + 1)
    setErrors((current) => ({ ...current, logo: '', logoUrl: '' }))
  }

  const chooseLogo = (event) => {
    const file = event.target.files?.[0] || null
    setLogo(file)
    setErrors((current) => ({ ...current, logo: validateUniversityForm(form, file).logo || '' }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setStatus({ error: '', saved: '' })
    const nextErrors = validateUniversityForm(form, logo)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setStatus({ error: 'Some fields need attention before the university can be saved.', saved: '' })
      return
    }

    setIsSaving(true)
    let existingQuery = supabase
      .from('partneruniversity')
      .select('university_id')
      .ilike('name', escapeLikePattern(form.name.trim()))
      .is('deleted_at', null)
    if (isEditing) existingQuery = existingQuery.neq('university_id', university.university_id)
    const existing = await existingQuery.limit(1)
    if (existing.error) {
      setStatus({ error: getDatabaseErrorMessage(existing.error), saved: '' })
      setIsSaving(false)
      return
    }
    if (existing.data.length > 0) {
      setErrors((current) => ({ ...current, name: duplicateNameMessage(form.name) }))
      setStatus({ error: duplicateNameMessage(form.name), saved: '' })
      setIsSaving(false)
      return
    }

    let universityId = isEditing ? university.university_id : generateUniversityId()
    let logoUrl = form.logoSource === 'url' && form.logoUrl !== '' ? form.logoUrl : null
    if (form.logoSource === 'upload' && logo) {
      const path = `${universityId}/${crypto.randomUUID()}.${LOGO_EXTENSIONS[logo.type]}`
      const upload = await supabase.storage.from(LOGO_BUCKET).upload(path, logo, { contentType: logo.type })
      if (upload.error) {
        setStatus({ error: `The logo could not be uploaded: ${upload.error.message}`, saved: '' })
        setIsSaving(false)
        return
      }
      logoUrl = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl
    }

    // Text is stored exactly as typed, in whatever language or script the coordinator used.
    const details = () => ({
      name: form.name,
      location: Number(form.country),
      details: form.details.trim() ? form.details : null,
      logo_url: logoUrl,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      airport_name: form.airportName,
      airport_code: form.airportCode,
      airport_latitude: Number(form.airportLatitude),
      airport_longitude: Number(form.airportLongitude),
    })

    if (isEditing) {
      // A single update, so a rejected save leaves every stored value as it was.
      const update = await supabase
        .from('partneruniversity')
        .update(details())
        .eq('university_id', universityId)
        .select('university_id')
      setIsSaving(false)
      if (update.error) {
        const isDuplicate = update.error.code === '23505' && update.error.message.includes('name')
        const message = isDuplicate ? duplicateNameMessage(form.name) : getDatabaseErrorMessage(update.error)
        if (isDuplicate) setErrors((current) => ({ ...current, name: message }))
        setStatus({ error: message, saved: '' })
        return
      }
      if (update.data.length === 0) {
        setStatus({ error: 'The changes were not saved. The university may have been deleted, or you may not have permission.', saved: '' })
        return
      }
      forgetPartnerUniversities()
      setStatus({ error: '', saved: form.name })
      return
    }

    const row = () => ({ university_id: universityId, ...details(), available: true })
    let insert = await supabase.from('partneruniversity').insert(row())
    // The id is random, so a clash with an existing id is retried once with a new one.
    if (insert.error?.code === '23505' && insert.error.message.includes('pkey')) {
      universityId = generateUniversityId()
      insert = await supabase.from('partneruniversity').insert(row())
    }
    setIsSaving(false)

    if (insert.error) {
      const message = insert.error.code === '23505' && insert.error.message.includes('name')
        ? duplicateNameMessage(form.name)
        : getDatabaseErrorMessage(insert.error)
      if (insert.error.code === '23505' && insert.error.message.includes('name')) {
        setErrors((current) => ({ ...current, name: message }))
      }
      setStatus({ error: message, saved: '' })
      return
    }

    forgetPartnerUniversities()
    setStatus({ error: '', saved: form.name })
    setForm(emptyForm)
    setLogo(null)
    setLogoInputKey((key) => key + 1)
    setPlacing('university')
  }

  // The map moves its markers whenever this object changes, so it changes only with the
  // coordinates and not with every keystroke in the other fields.
  const pins = useMemo(() => ({
    university: pinFrom(form.latitude, form.longitude),
    airport: pinFrom(form.airportLatitude, form.airportLongitude),
  }), [form.latitude, form.longitude, form.airportLatitude, form.airportLongitude])
  const describedBy = (field) => (errors[field] ? `add-university-${field}-error` : undefined)

  return (
    <>
      <span className="auth-card__eyebrow">Partner universities</span>
      {isEditing ? (
        <>
          <h2 id="portal-heading">Edit <span dir="auto">{university.name}</span></h2>
          <p>Changes appear in the partner directory and on the world map as soon as they are saved.</p>
        </>
      ) : (
        <>
          <h2 id="portal-heading">Add a partner university</h2>
          <p>New universities are available to students as soon as they are saved.</p>
        </>
      )}
      <form className="cycle-form add-university" onSubmit={submit} noValidate>
        <div className="cycle-form__grid">
          <label htmlFor="add-university-name">Name
            <input id="add-university-name" name="name" value={form.name} onChange={updateField} dir="auto" aria-invalid={Boolean(errors.name)} aria-describedby={describedBy('name')} />
            <FieldError id="add-university-name-error" message={errors.name} />
          </label>
          <label htmlFor="add-university-country">Country
            <select id="add-university-country" name="country" value={form.country} onChange={updateField} aria-invalid={Boolean(errors.country)} aria-describedby={describedBy('country')}>
              <option value="">Choose a country</option>
              {countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
            </select>
            <FieldError id="add-university-country-error" message={errors.country || countryError} />
          </label>
          <label className="add-university__wide" htmlFor="add-university-details">Details
            <textarea id="add-university-details" name="details" rows="4" value={form.details} onChange={updateField} dir="auto" />
          </label>
          <fieldset className="add-university__wide add-university__logo">
            <legend>Logo (optional)</legend>
            <div className="add-university__placing" role="radiogroup" aria-label="Logo source">
              {[['upload', 'Upload an image'], ['url', 'Use an image link']].map(([source, label]) => (
                <label key={source} className={form.logoSource === source ? 'add-university__placing-option add-university__placing-option--active' : 'add-university__placing-option'}>
                  <input type="radio" name="logoSource" value={source} checked={form.logoSource === source} onChange={() => chooseLogoSource(source)} />
                  {label}
                </label>
              ))}
            </div>
            {form.logoSource === 'upload' ? (
              <label htmlFor="add-university-logo">PNG or JPG, up to 2 MB
                <input key={logoInputKey} id="add-university-logo" type="file" accept="image/png,image/jpeg" onChange={chooseLogo} aria-invalid={Boolean(errors.logo)} aria-describedby={describedBy('logo')} />
                <FieldError id="add-university-logo-error" message={errors.logo} />
              </label>
            ) : (
              <label htmlFor="add-university-logo-url">Image address
                <input id="add-university-logo-url" name="logoUrl" type="url" value={form.logoUrl} onChange={updateField} placeholder="https://" aria-invalid={Boolean(errors.logoUrl)} aria-describedby={describedBy('logoUrl')} />
                <FieldError id="add-university-logoUrl-error" message={errors.logoUrl} />
              </label>
            )}
          </fieldset>
        </div>

        <fieldset className="add-university__locations">
          <legend>Locations</legend>
          <p className="add-university__hint">Choose which pin to place, then click the map. Pins can also be dragged.</p>
          <div className="add-university__placing" role="radiogroup" aria-label="Pin to place">
            {[['university', 'University'], ['airport', 'Closest airport']].map(([kind, label]) => (
              <label key={kind} className={placing === kind ? 'add-university__placing-option add-university__placing-option--active' : 'add-university__placing-option'}>
                <input type="radio" name="placing" value={kind} checked={placing === kind} onChange={() => setPlacing(kind)} />
                <span className={`add-university__pin add-university__pin--${kind}`} aria-hidden="true" />
                {label}
              </label>
            ))}
          </div>
          <LocationPicker pins={pins} placing={placing} onPlace={placePin} startAt={startAt} />
          <div className="cycle-form__grid">
            <label htmlFor="add-university-latitude">University latitude
              <input id="add-university-latitude" name="latitude" type="number" step="any" min="-90" max="90" value={form.latitude} onChange={updateField} aria-invalid={Boolean(errors.latitude)} aria-describedby={describedBy('latitude')} />
              <FieldError id="add-university-latitude-error" message={errors.latitude} />
            </label>
            <label htmlFor="add-university-longitude">University longitude
              <input id="add-university-longitude" name="longitude" type="number" step="any" min="-180" max="180" value={form.longitude} onChange={updateField} aria-invalid={Boolean(errors.longitude)} aria-describedby={describedBy('longitude')} />
              <FieldError id="add-university-longitude-error" message={errors.longitude} />
            </label>
            <label htmlFor="add-university-airport-name">Closest airport name
              <input id="add-university-airport-name" name="airportName" value={form.airportName} onChange={updateField} dir="auto" aria-invalid={Boolean(errors.airportName)} aria-describedby={describedBy('airportName')} />
              <FieldError id="add-university-airportName-error" message={errors.airportName} />
            </label>
            <label htmlFor="add-university-airport-code">Airport code
              <input id="add-university-airport-code" name="airportCode" value={form.airportCode} onChange={updateField} maxLength="3" placeholder="CDG" autoCapitalize="characters" aria-invalid={Boolean(errors.airportCode)} aria-describedby={describedBy('airportCode')} />
              <FieldError id="add-university-airportCode-error" message={errors.airportCode} />
            </label>
            <label htmlFor="add-university-airport-latitude">Airport latitude
              <input id="add-university-airport-latitude" name="airportLatitude" type="number" step="any" min="-90" max="90" value={form.airportLatitude} onChange={updateField} aria-invalid={Boolean(errors.airportLatitude)} aria-describedby={describedBy('airportLatitude')} />
              <FieldError id="add-university-airportLatitude-error" message={errors.airportLatitude} />
            </label>
            <label htmlFor="add-university-airport-longitude">Airport longitude
              <input id="add-university-airport-longitude" name="airportLongitude" type="number" step="any" min="-180" max="180" value={form.airportLongitude} onChange={updateField} aria-invalid={Boolean(errors.airportLongitude)} aria-describedby={describedBy('airportLongitude')} />
              <FieldError id="add-university-airportLongitude-error" message={errors.airportLongitude} />
            </label>
          </div>
        </fieldset>

        {status.error && <p className="auth-form__error" role="alert">{status.error}</p>}
        <div className="cycle-form__actions">
          <button className="btn btn--primary" type="submit" disabled={isSaving}>
            {isSaving ? 'Saving university...' : isEditing ? 'Save changes' : 'Add university'}
          </button>
          {onBack && <button className="btn btn--secondary" type="button" onClick={onBack} disabled={isSaving}>Back to partner universities</button>}
        </div>
        {status.saved && (
          <p className="add-university__saved" role="status">
            {isEditing
              ? <>Changes to <strong dir="auto">{status.saved}</strong> were saved.</>
              : <><strong dir="auto">{status.saved}</strong> was added.</>}
            {' '}It now appears on the <Link to="/partners">partner directory and world map</Link>.
          </p>
        )}
      </form>
    </>
  )
}
