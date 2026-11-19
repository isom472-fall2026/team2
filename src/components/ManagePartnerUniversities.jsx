import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { forgetPartnerUniversities, getCountries, getPartnerUniversities } from '../referenceData'
import AddPartnerUniversity from './AddPartnerUniversity'
import ConfirmDialog from './ConfirmDialog'

// The original universities were seeded before coordinates and airports were stored, so
// editing one starts from the researched values the directory already shows for it.
function withResearchedLocation(university, fallbackCoordinates, fallbackAirports) {
  const coordinates = fallbackCoordinates[university.name]
  const airport = fallbackAirports[university.name]
  return {
    ...university,
    latitude: university.latitude ?? coordinates?.[0] ?? null,
    longitude: university.longitude ?? coordinates?.[1] ?? null,
    airport_name: university.airport_name ?? airport?.name ?? null,
    airport_code: university.airport_code ?? airport?.code ?? null,
    airport_latitude: university.airport_latitude ?? airport?.coordinates?.[1] ?? null,
    airport_longitude: university.airport_longitude ?? airport?.coordinates?.[0] ?? null,
  }
}

function DeleteDialog({ university, coordinatorCount, isDeleting, error, onConfirm, onCancel }) {
  return (
    <ConfirmDialog
      id="university-delete"
      title="Delete partner university?"
      error={error}
      busy={isDeleting}
      confirmLabel="Delete university"
      busyLabel="Deleting..."
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <strong dir="auto">{university.name}</strong> will no longer appear in the partner directory, on the world
      map or as a choice in applications.
      {coordinatorCount > 0 && ` Its ${coordinatorCount} partner coordinator ${coordinatorCount === 1 ? 'account loses' : 'accounts lose'} access.`}
      {' '}Past applications keep their record. This cannot be undone from the website.
    </ConfirmDialog>
  )
}

export default function ManagePartnerUniversities({ fallbackCoordinates = {}, fallbackAirports = {} }) {
  const [universities, setUniversities] = useState([])
  const [countries, setCountries] = useState({})
  const [coordinatorCounts, setCoordinatorCounts] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [message, setMessage] = useState('')
  const [testingMode, setTestingMode] = useState(false)

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let isCurrent = true
    Promise.all([
      getPartnerUniversities(),
      getCountries(),
      supabase.from('coordinator').select('university'),
      supabase.rpc('is_testing_mode_enabled'),
    ]).then(([universityResult, countryResult, coordinatorResult, testingResult]) => {
      if (!isCurrent) return
      const error = universityResult.error || countryResult.error || coordinatorResult.error
      if (error) setLoadError(getDatabaseErrorMessage(error))
      else {
        setLoadError('')
        // Kuwait University (4) is the home institution, not a partner.
        setUniversities(universityResult.data.filter((university) => university.deleted_at === null && Number(university.university_id) !== 4))
        setCountries(Object.fromEntries((countryResult.data || []).map((country) => [country.id, country.name])))
        const counts = {}
        ;(coordinatorResult.data || []).forEach(({ university }) => { counts[university] = (counts[university] || 0) + 1 })
        setCoordinatorCounts(counts)
        setTestingMode(testingResult.data === true)
      }
      setIsLoading(false)
    })
    return () => {
      isCurrent = false
    }
  }, [reloadKey])

  const closeEditor = () => {
    setEditing(null)
    setIsLoading(true)
    setReloadKey((key) => key + 1)
  }

  const confirmDelete = async () => {
    setIsDeleting(true)
    setDeleteError('')
    const { error } = await supabase.rpc('retire_partner_university', { target_university_id: pendingDelete.university_id })
    setIsDeleting(false)
    if (error) {
      setDeleteError(getDatabaseErrorMessage(error))
      return
    }
    forgetPartnerUniversities()
    setUniversities((current) => current.filter((university) => university.university_id !== pendingDelete.university_id))
    setMessage(`${pendingDelete.name} was deleted. It no longer appears in the directory or in applications.`)
    setPendingDelete(null)
  }

  if (editing) {
    return (
      <AddPartnerUniversity
        key={editing.university_id}
        university={withResearchedLocation(editing, fallbackCoordinates, fallbackAirports)}
        onBack={closeEditor}
      />
    )
  }

  return (
    <>
      {pendingDelete && (
        <DeleteDialog
          university={pendingDelete}
          coordinatorCount={coordinatorCounts[pendingDelete.university_id] || 0}
          isDeleting={isDeleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => {
            setPendingDelete(null)
            setDeleteError('')
          }}
        />
      )}
      <span className="auth-card__eyebrow">Partner universities</span>
      <h2 id="portal-heading">Manage partner universities</h2>
      <p>Edit a university&apos;s details, logo and map pins, or delete it from the exchange programme.</p>
      {/* Changes made while testing are undone by the database when testing mode ends, which
          coordinators should know before they edit or delete a real university. */}
      {testingMode && (
        <p className="add-university__notice" role="note">
          Testing mode is on. Edits and deletions made here are undone automatically when testing mode is turned off.
        </p>
      )}
      {message && <p className="add-university__saved" role="status" dir="auto">{message}</p>}
      {loadError && <p className="auth-form__error" role="alert">{loadError}</p>}
      {isLoading ? <p role="status">Loading partner universities...</p>
        : universities.length === 0 ? <div className="portal-empty-state">No partner universities yet.</div> : (
          <div className="nomination-table-wrap">
            <table className="nomination-table">
              <thead>
                <tr>
                  <th scope="col">University</th>
                  <th scope="col">Country</th>
                  <th scope="col">Closest airport</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {universities.map((university) => {
                  const airport = university.airport_code || fallbackAirports[university.name]?.code
                  return (
                    <tr key={university.university_id}>
                      <th scope="row" dir="auto">{university.name}</th>
                      <td>{countries[university.location] || 'Not set'}</td>
                      <td>{airport || 'Not set'}</td>
                      <td>
                        <div className="nomination-table__actions">
                          <button className="btn btn--secondary" type="button" onClick={() => {
                            setMessage('')
                            setEditing(university)
                          }}>
                            Edit
                          </button>
                          <button className="btn btn--danger" type="button" onClick={() => {
                            setMessage('')
                            setPendingDelete(university)
                          }}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
    </>
  )
}
