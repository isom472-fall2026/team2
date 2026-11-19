import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import DateField from './DateField'
import ConfirmDialog from './ConfirmDialog'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { isKuCoordinatorProfile } from '../coordinatorProfile'
import { partnerUniversityAirports, partnerUniversityCoordinates } from '../partnerUniversities'
import { forgetCycles, getCycles, getPartnerUniversities } from '../referenceData'
import { useAppStore } from '../stores/appStore'
import { useStatusToast } from '../useStatusToast'

const CoordinatorApplications = lazy(() => import('./CoordinatorApplications'))
const SendApplicationUpdate = lazy(() => import('./CoordinatorApplications').then((module) => ({ default: module.SendApplicationUpdate })))
const StudentInbox = lazy(() => import('./StudentInbox'))
const SupportRequests = lazy(() => import('./SupportRequests'))
const CoordinatorSupportRequests = lazy(() => import('./CoordinatorSupportRequests'))
const CoordinatorAccountSettings = lazy(() => import('./CoordinatorAccount'))
const CoordinatorPasswordPage = lazy(() => import('./CoordinatorAccount').then((module) => ({ default: module.CoordinatorPasswordPage })))
const AddPartnerUniversity = lazy(() => import('./AddPartnerUniversity'))
const ManagePartnerUniversities = lazy(() => import('./ManagePartnerUniversities'))
const SubjectImport = lazy(() => import('./SubjectImport'))
const StudentAccount = lazy(() => import('./StudentAccount'))


// One highlight for the whole sidebar. It slides to the selected tab, so the tabs themselves can
// stay plain. Rendered as the last child of the nav it belongs to.
function SidebarHighlight({ activeView }) {
  const highlightRef = useRef(null)

  useLayoutEffect(() => {
    const highlight = highlightRef.current
    const nav = highlight.parentElement
    const place = () => {
      const tab = nav.querySelector('.portal-sidebar__action--active')
      highlight.style.opacity = tab ? '1' : '0'
      if (!tab) return
      highlight.style.width = `${tab.offsetWidth}px`
      highlight.style.height = `${tab.offsetHeight}px`
      highlight.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`
    }
    place()
    // Tabs move when the sidebar changes width or a label wraps.
    const observer = new ResizeObserver(place)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [activeView])

  return <span ref={highlightRef} className="portal-sidebar__highlight" aria-hidden="true" />
}

function generateNominationId() {
  const randomValues = new Uint32Array(1)
  crypto.getRandomValues(randomValues)
  return 10000000 + (randomValues[0] % 90000000)
}

function AccountDeleteButton({ onDeleted }) {
  const [error, setError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)

  const deleteAccount = async () => {
    setError('')
    setIsDeleting(true)
    const { error: deleteError } = await supabase.rpc('delete_my_account')
    if (deleteError) {
      setError(getDatabaseErrorMessage(deleteError))
      setIsDeleting(false)
      return
    }

    await supabase.auth.signOut()
    onDeleted()
  }

  return (
    <div className="account-delete">
      {!isConfirming ? (
        <button className="btn btn--danger" type="button" onClick={() => setIsConfirming(true)} disabled={isDeleting}>
          Delete account
        </button>
      ) : (
        <div className="account-delete__confirmation" role="alertdialog" aria-labelledby="delete-account-heading">
          <strong id="delete-account-heading">Delete your account permanently?</strong>
          <p>This cannot be undone. Your profile and authentication account will be removed.</p>
          <div className="account-delete__actions">
            <button className="btn btn--secondary" type="button" onClick={() => setIsConfirming(false)} disabled={isDeleting}>
              Cancel
            </button>
            <button className="btn btn--danger" type="button" onClick={deleteAccount} disabled={isDeleting}>
              {isDeleting ? 'Deleting account...' : 'Permanently delete'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="auth-form__error" role="alert">{error}</p>}
    </div>
  )
}

const emptyCycleForm = {
  semester: 'Fall',
  academicYear: '',
  nominationsOpen: '',
  nominationsClose: '',
  applicationOpen: '',
  applicationClose: '',
  cycleStart: '',
  cycleEnd: '',
}

// The shared copy of the cycles is in id order; the cycle list shows the latest start first,
// and cycles with no start last.
function newestCycleFirst(cycles) {
  return [...cycles].sort((left, right) => {
    const leftStart = Date.parse(left.cycle_start)
    const rightStart = Date.parse(right.cycle_start)
    if (Number.isNaN(leftStart) !== Number.isNaN(rightStart)) return Number.isNaN(leftStart) ? 1 : -1
    if (!Number.isNaN(leftStart) && leftStart !== rightStart) return rightStart - leftStart
    return Number(right.id) - Number(left.id)
  })
}

function formatCycleDate(value) {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleString()
}

function toDateTimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function validateCycleForm(form) {
  const dates = [
    ['nominations', form.nominationsOpen, form.nominationsClose],
    ['applications', form.applicationOpen, form.applicationClose],
    ['KU semester', form.cycleStart, form.cycleEnd],
  ]
  if (dates.some(([, open, close]) => !open || !close || Number.isNaN(new Date(open).getTime()) || Number.isNaN(new Date(close).getTime()))) {
    return 'Enter valid opening and closing dates for every cycle stage.'
  }
  return dates.some(([, open, close]) => new Date(open) >= new Date(close))
    ? 'Each opening or start date must be before its closing or end date.'
    : ''
}

function cycleDataFromForm(form) {
  return {
    semester: form.semester,
    academic_year: form.academicYear,
    nominations_o: new Date(form.nominationsOpen).toISOString(),
    nominations_c: new Date(form.nominationsClose).toISOString(),
    application_o: new Date(form.applicationOpen).toISOString(),
    application_c: new Date(form.applicationClose).toISOString(),
    cycle_start: new Date(form.cycleStart).toISOString(),
    cycle_end: new Date(form.cycleEnd).toISOString(),
  }
}

function cycleFormFromCycle(cycle) {
  return {
    semester: cycle.semester,
    academicYear: cycle.academic_year,
    nominationsOpen: toDateTimeLocal(cycle.nominations_o),
    nominationsClose: toDateTimeLocal(cycle.nominations_c),
    applicationOpen: toDateTimeLocal(cycle.application_o),
    applicationClose: toDateTimeLocal(cycle.application_c),
    cycleStart: toDateTimeLocal(cycle.cycle_start),
    cycleEnd: toDateTimeLocal(cycle.cycle_end),
  }
}

function CycleForm({ form, setForm, onSubmit, isSubmitting, status, submitLabel, onCancel }) {
  const updateField = (event) => setForm({ ...form, [event.target.name]: event.target.value })

  return (
    <form className="cycle-form" onSubmit={onSubmit}>
      <div className="cycle-form__grid">
        <label htmlFor="cycle-semester">Semester
          <select id="cycle-semester" name="semester" value={form.semester} onChange={updateField} required>
            <option value="Fall">Fall</option>
            <option value="Spring">Spring</option>
          </select>
        </label>
        <label htmlFor="cycle-academic-year">Academic year
          <input id="cycle-academic-year" name="academicYear" value={form.academicYear} onChange={updateField} placeholder="2026/2027" pattern="\d{4}/\d{4}" required />
        </label>
        <label htmlFor="cycle-nominations-open">Inbound nominations open
          <DateField id="cycle-nominations-open" name="nominationsOpen" type="datetime-local" value={form.nominationsOpen} onChange={updateField} required />
        </label>
        <label htmlFor="cycle-nominations-close">Inbound nominations close
          <DateField id="cycle-nominations-close" name="nominationsClose" type="datetime-local" value={form.nominationsClose} onChange={updateField} required />
        </label>
        <label htmlFor="cycle-application-open">Applications open
          <DateField id="cycle-application-open" name="applicationOpen" type="datetime-local" value={form.applicationOpen} onChange={updateField} required />
        </label>
        <label htmlFor="cycle-application-close">Applications close
          <DateField id="cycle-application-close" name="applicationClose" type="datetime-local" value={form.applicationClose} onChange={updateField} required />
        </label>
        <label htmlFor="cycle-start">KU semester begins
          <DateField id="cycle-start" name="cycleStart" type="datetime-local" value={form.cycleStart} onChange={updateField} required />
        </label>
        <label htmlFor="cycle-end">KU semester ends
          <DateField id="cycle-end" name="cycleEnd" type="datetime-local" value={form.cycleEnd} onChange={updateField} required />
        </label>
      </div>
      {status.error && <p className="auth-form__error" role="alert">{status.error}</p>}
      <div className="cycle-form__actions">
        <button className="btn btn--primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving cycle...' : submitLabel}
        </button>
        {onCancel && <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={isSubmitting}>Cancel</button>}
      </div>
    </form>
  )
}

function CoordinatorPortal({ onDeleted, onSignOut, onRetryMaintenanceStatus }) {
  const profile = useAppStore((state) => state.profile)
  const userEmail = useAppStore((state) => state.session?.user.email)
  const maintenanceMode = useAppStore((state) => state.maintenanceMode)
  const setMaintenanceMode = useAppStore((state) => state.setMaintenanceMode)
  const profileEmailIsKu = profile.email?.trim().toLowerCase().endsWith('@ku.edu.kw')
  const authenticatedEmailIsKu = userEmail?.trim().toLowerCase().endsWith('@ku.edu.kw')
  const universityId = profile.university ?? profile.university_id
  const isKuCoordinator = Number(universityId) === 4
    || profileEmailIsKu
    || authenticatedEmailIsKu
  const [nominations, setNominations] = useState([])
  const [isLoadingNominations, setIsLoadingNominations] = useState(true)
  const [applicationStatuses, setApplicationStatuses] = useState({})
  const [isLoadingProgress, setIsLoadingProgress] = useState(!isKuCoordinator)
  const [progressError, setProgressError] = useState('')
  const [progressCycle, setProgressCycle] = useState('all')
  const [editingNominationId, setEditingNominationId] = useState(null)
  const [nominationEditForm, setNominationEditForm] = useState({
    studentName: '',
    studentEmail: '',
    semester: '',
  })
  const [nominationEditError, setNominationEditError] = useState('')
  const [isSavingNomination, setIsSavingNomination] = useState(false)
  const [pendingDeleteNomination, setPendingDeleteNomination] = useState(null)
  const [isDeletingNomination, setIsDeletingNomination] = useState(false)
  const [semesters, setSemesters] = useState([])
  const [form, setForm] = useState({ studentName: '', studentEmail: '', semester: '' })
  const [cycleForm, setCycleForm] = useState(emptyCycleForm)
  const [cycles, setCycles] = useState([])
  const [coordinators, setCoordinators] = useState([])
  const [withdrawalRequests, setWithdrawalRequests] = useState([])
  const [isLoadingWithdrawals, setIsLoadingWithdrawals] = useState(isKuCoordinator)
  const [reviewingWithdrawalKey, setReviewingWithdrawalKey] = useState(null)
  const [partnerUniversities, setPartnerUniversities] = useState([])
  const [isLoadingCoordinators, setIsLoadingCoordinators] = useState(isKuCoordinator)
  const [editingCycleId, setEditingCycleId] = useState(null)
  const [pendingDeleteCycle, setPendingDeleteCycle] = useState(null)
  const [isDeletingCycle, setIsDeletingCycle] = useState(false)
  const returnView = useLocation().state?.view
  const [activeView, setActiveView] = useState(
    isKuCoordinator && ['applications', 'subjects'].includes(returnView) ? returnView : isKuCoordinator ? 'manage' : 'nominations',
  )
  const [selectedNominationCycle, setSelectedNominationCycle] = useState(null)
  const [isStartingCycle, setIsStartingCycle] = useState(false)
  const { status, clearStatus, showError, showSuccess, statusToast } = useStatusToast()
  const [maintenanceError, setMaintenanceError] = useState('')
  const [isUpdatingMaintenance, setIsUpdatingMaintenance] = useState(false)

  const handleMaintenanceToggle = async () => {
    if (maintenanceMode === null || isUpdatingMaintenance) return
    const nextMode = !maintenanceMode
    setIsUpdatingMaintenance(true)
    setMaintenanceError('')
    const { data, error } = await supabase.rpc('set_maintenance_mode', {
      requested_mode: nextMode,
    })
    setIsUpdatingMaintenance(false)
    if (error) {
      setMaintenanceError(getDatabaseErrorMessage(error))
      clearStatus()
      return
    }
    if (data !== nextMode) {
      setMaintenanceError('The database did not confirm the requested maintenance status.')
      clearStatus()
      return
    }
    setMaintenanceMode(data)
    showSuccess(nextMode ? 'Maintenance mode enabled. Visitors will see the maintenance page.' : 'Maintenance mode disabled. The website is live again.')
  }

  // Runs after this view starts or edits a cycle, so the shared copy is read again.
  const loadCycles = async () => {
    forgetCycles()
    const { data, error } = await getCycles()
    if (error) {
      showError(getDatabaseErrorMessage(error))
      return false
    }
    setCycles(newestCycleFirst(data))
    return true
  }

  useEffect(() => {
    let isCurrent = true
    const loadNominations = async () => {
      let nominationsQuery = supabase
        .from('studentnominations')
        .select('id, student_name, student_email, created_at, semester, nomination_status')
      if (!isKuCoordinator) nominationsQuery = nominationsQuery.eq('coordinator_id', profile.coordinator_id)
      const { data, error } = await nominationsQuery.order('created_at', { ascending: false })
      if (!isCurrent) return
      if (error) {
        const errorMessage = getDatabaseErrorMessage(error)
        showError(errorMessage)
        if (!isKuCoordinator) setProgressError(errorMessage)
        setIsLoadingProgress(false)
        setIsLoadingNominations(false)
        return
      }

      const loadedNominations = data || []
      setNominations(loadedNominations)
      setIsLoadingNominations(false)

      if (isKuCoordinator || loadedNominations.length === 0) {
        setApplicationStatuses({})
        setProgressError('')
        setIsLoadingProgress(false)
        return
      }

      const { data: applications, error: applicationError } = await supabase
        .from('inboundapplication')
        .select('nomination_id, application_status')
        .in('nomination_id', loadedNominations.map(({ id }) => id))
        .neq('application_status', 'Modified')
      if (!isCurrent) return

      if (applicationError) {
        setProgressError(getDatabaseErrorMessage(applicationError))
        setApplicationStatuses({})
      } else {
        setProgressError('')
        setApplicationStatuses(Object.fromEntries(
          (applications || []).map(({ nomination_id, application_status }) => [
            nomination_id,
            application_status,
          ]),
        ))
      }
      setIsLoadingProgress(false)
    }
    loadNominations()

    getCycles()
      .then(({ data, error }) => {
        if (error) {
          showError(getDatabaseErrorMessage(error))
          return
        }
        setCycles(newestCycleFirst(data))
        setSemesters([...data].sort((left, right) => Number(left.id) - Number(right.id)))
      })
    if (isKuCoordinator) {
      supabase
        .from('coordinator')
        .select('coordinator_id, name, email, university, email_accepted')
        .neq('coordinator_id', profile.coordinator_id)
        .order('name')
        .then(({ data, error }) => {
          if (error) showError(getDatabaseErrorMessage(error))
          else setCoordinators(data || [])
          setIsLoadingCoordinators(false)
        })
      getPartnerUniversities()
        .then(({ data, error }) => {
          if (error) showError(getDatabaseErrorMessage(error))
          else setPartnerUniversities(data)
        })
    }
    return () => {
      isCurrent = false
    }
  }, [profile.coordinator_id, isKuCoordinator, showError])

  useEffect(() => {
    if (!isKuCoordinator) return undefined
    let isCurrent = true
    Promise.all([
      supabase
        .from('outboundapplication')
        .select('application_id, student_id, semester_applied_for, university_id, submitted_at, application_status, withdrawal_reason, withdrawal_previous_status, status_updated_at, student:kustudentauth(name, student_email)')
        .eq('application_status', 'Withdrawal Requested')
        .order('status_updated_at', { ascending: false }),
      supabase
        .from('inboundapplication')
        .select('application_id, student_id, semester_applied_for, university_id, submitted_at, application_status, withdrawal_reason, withdrawal_previous_status, status_updated_at, student:incomingstudentauth(name, student_email)')
        .eq('application_status', 'Withdrawal Requested')
        .order('status_updated_at', { ascending: false }),
    ]).then(([outboundResult, inboundResult]) => {
      if (!isCurrent) return
      const requestError = outboundResult.error || inboundResult.error
      if (requestError) showError(getDatabaseErrorMessage(requestError))
      else setWithdrawalRequests([
        ...(outboundResult.data || []).map((item) => ({ ...item, application_type: 'outbound' })),
        ...(inboundResult.data || []).map((item) => ({ ...item, application_type: 'inbound' })),
      ].sort((left, right) => new Date(right.status_updated_at) - new Date(left.status_updated_at)))
      setIsLoadingWithdrawals(false)
    })
    return () => { isCurrent = false }
  }, [isKuCoordinator, showError])

  const reviewWithdrawal = async (application, approveRequest) => {
    const withdrawalKey = `${application.application_type}-${application.application_id}`
    if (reviewingWithdrawalKey) return

    clearStatus()
    setReviewingWithdrawalKey(withdrawalKey)
    const { data, error } = await supabase.rpc(application.application_type === 'inbound'
      ? 'review_inbound_withdrawal'
      : 'review_outbound_withdrawal', {
      requested_application_id: Number(application.application_id),
      approve_request: approveRequest,
    })
    setReviewingWithdrawalKey(null)
    if (error || !data) {
      showError(error ? getDatabaseErrorMessage(error) : 'The withdrawal request was not updated. It may already have been reviewed.')
      return
    }
    setWithdrawalRequests((current) => current.filter((item) => (
      item.application_type !== application.application_type
      || Number(item.application_id) !== Number(data.application_id)
    )))
    showSuccess(approveRequest ? 'Withdrawal approved.' : 'Withdrawal rejected and the previous status was restored.')
  }

  // While testing mode is on, the database lets KU coordinators change only coordinators
  // created during the test, so a change that matched no row is explained by that first.
  const coordinatorChangeBlockedMessage = async (fallback) => {
    const { data: testingModeOn } = await supabase.rpc('is_testing_mode_enabled')
    return testingModeOn === true
      ? 'Testing mode is on, so only coordinators created during the test can be changed. Turn testing mode off to change this coordinator.'
      : fallback
  }

  const updateCoordinatorAccess = async (coordinator, isAccepted) => {
    clearStatus()
    if (isAccepted) {
      const { data, error } = await supabase
        .from('coordinator')
        .update({ email_accepted: true })
        .eq('coordinator_id', coordinator.coordinator_id)
        .select('coordinator_id, name, email, university, email_accepted')
        .maybeSingle()
      if (error) {
        showError(getDatabaseErrorMessage(error))
        return
      }
      if (!data) {
        showError(await coordinatorChangeBlockedMessage('The coordinator access was not updated. You may not have permission.'))
        return
      }
      setCoordinators((current) => current.map((item) => item.coordinator_id === data.coordinator_id ? data : item))
      showSuccess('Coordinator access granted.')
    } else {
      const { data, error } = await supabase
        .from('coordinator')
        .delete()
        .eq('coordinator_id', coordinator.coordinator_id)
        .select('coordinator_id')
        .maybeSingle()
      // Removing a coordinator also removes their nominations, which the database refuses
      // once a nominated student has applied, so those applications are never lost.
      if (error?.code === '23503') {
        showError('This coordinator has nominated students who have already applied, so their request cannot be removed without losing those applications.')
        return
      }
      if (error) {
        showError(getDatabaseErrorMessage(error))
        return
      }
      if (!data) {
        showError(await coordinatorChangeBlockedMessage('The coordinator request was not removed. You may not have permission.'))
        return
      }
      setCoordinators((current) => current.filter((item) => item.coordinator_id !== data.coordinator_id))
      showSuccess('Coordinator request refused.')
    }
  }

  const startExchangeCycle = async (event) => {
    event.preventDefault()
    clearStatus()
    const validationError = validateCycleForm(cycleForm)
    if (validationError) {
      showError(validationError)
      return
    }
    setIsStartingCycle(true)
    const { data: existingCycle, error: duplicateCheckError } = await supabase
      .from('exchange_cycle')
      .select('id')
      .eq('semester', cycleForm.semester)
      .eq('academic_year', cycleForm.academicYear)
      .limit(1)
      .maybeSingle()
    if (duplicateCheckError) {
      showError(getDatabaseErrorMessage(duplicateCheckError))
      setIsStartingCycle(false)
      return
    }
    if (existingCycle) {
      showError(`A ${cycleForm.semester} ${cycleForm.academicYear} KU semester already exists.`)
      setIsStartingCycle(false)
      return
    }

    const { data: latestCycle, error: latestCycleError } = await supabase
      .from('exchange_cycle')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestCycleError) {
      showError(getDatabaseErrorMessage(latestCycleError))
      setIsStartingCycle(false)
      return
    }

    const { error } = await supabase.from('exchange_cycle').insert({
      id: (latestCycle?.id ?? 0) + 1,
      ...cycleDataFromForm(cycleForm),
    })
    if (error) {
      showError(getDatabaseErrorMessage(error))
    } else {
      setCycleForm(emptyCycleForm)
      if (await loadCycles()) {
        showSuccess('KU semester started.')
        setActiveView('manage')
      }
    }
    setIsStartingCycle(false)
  }

  const editExchangeCycle = async (event) => {
    event.preventDefault()
    clearStatus()
    const validationError = validateCycleForm(cycleForm)
    if (validationError) {
      showError(validationError)
      return
    }

    const { data: existingCycle, error: duplicateCheckError } = await supabase
      .from('exchange_cycle')
      .select('id')
      .eq('semester', cycleForm.semester)
      .eq('academic_year', cycleForm.academicYear)
      .neq('id', editingCycleId)
      .limit(1)
      .maybeSingle()
    if (duplicateCheckError) {
      showError(getDatabaseErrorMessage(duplicateCheckError))
      return
    }
    if (existingCycle) {
      showError(`A ${cycleForm.semester} ${cycleForm.academicYear} KU semester already exists.`)
      return
    }

    setIsStartingCycle(true)
    const { data: updatedCycle, error } = await supabase
      .from('exchange_cycle')
      .update(cycleDataFromForm(cycleForm))
      .eq('id', editingCycleId)
      .select('id')
      .maybeSingle()
    setIsStartingCycle(false)
    if (error) {
      showError(getDatabaseErrorMessage(error))
      return
    }
    if (!updatedCycle) {
      showError('The cycle was not updated. It may have been removed or you may not have permission.')
      return
    }
    if (await loadCycles()) {
      setEditingCycleId(null)
      showSuccess('KU semester updated.')
    }
  }

  const deleteExchangeCycle = async () => {
    if (!pendingDeleteCycle) return
    const cycle = pendingDeleteCycle
    clearStatus()
    setIsDeletingCycle(true)
    const { data: deletedCycle, error } = await supabase
      .from('exchange_cycle')
      .delete()
      .eq('id', cycle.id)
      .select('id')
      .maybeSingle()
    setIsDeletingCycle(false)
    if (error) {
      showError(getDatabaseErrorMessage(error))
      return
    }
    if (!deletedCycle) {
      showError('The cycle was not deleted. It may have already been removed or you may not have permission.')
      return
    }
    forgetCycles()
    setCycles((currentCycles) => currentCycles.filter(({ id }) => id !== cycle.id))
    if (editingCycleId === cycle.id) setEditingCycleId(null)
    setPendingDeleteCycle(null)
    showSuccess('KU semester deleted.')
  }

  const submitNomination = async (event) => {
    event.preventDefault()
    clearStatus()
    const coordinatorId = Number(profile.coordinator_id)
    if (!Number.isInteger(coordinatorId) || coordinatorId <= 0) {
      showError('Your coordinator profile could not be identified. Please sign in again.')
      return
    }
    let nominationId
    let error
    for (let attempt = 0; attempt < 5; attempt += 1) {
      nominationId = generateNominationId()
      const result = await supabase.from('studentnominations').insert({
        id: nominationId,
        coordinator_id: coordinatorId,
        student_name: form.studentName.trim(),
        student_email: form.studentEmail.trim(),
        semester: Number(form.semester),
      })
      error = result.error
      if (!error || error.code !== '23505') break
    }
    if (error) {
      showError(error.code === '23505' ? 'A unique nomination ID could not be generated. Please try again.' : getDatabaseErrorMessage(error))
      return
    }
    setForm({ studentName: '', studentEmail: '', semester: '' })
    showSuccess(`Student nomination submitted. Save nomination ID ${nominationId} and share it with the student.`)
    let nominationsQuery = supabase
      .from('studentnominations')
      .select('id, student_name, student_email, created_at, semester, nomination_status')
    if (!isKuCoordinator) nominationsQuery = nominationsQuery.eq('coordinator_id', coordinatorId)
    const { data: updatedNominations, error: refreshError } = await nominationsQuery
      .order('created_at', { ascending: false })
    if (refreshError) {
      showError(getDatabaseErrorMessage(refreshError))
      return
    }
    setNominations(updatedNominations || [])
  }

  const saveNomination = async (event) => {
    event.preventDefault()
    setNominationEditError('')
    const coordinatorId = Number(profile.coordinator_id)
    if (!Number.isInteger(coordinatorId) || coordinatorId <= 0) {
      setNominationEditError('Your coordinator profile could not be identified. Please sign in again.')
      return
    }

    setIsSavingNomination(true)
    const { data: updatedNomination, error } = await supabase
      .from('studentnominations')
      .update({
        student_name: nominationEditForm.studentName.trim(),
        student_email: nominationEditForm.studentEmail.trim(),
        semester: Number(nominationEditForm.semester),
      })
      .eq('id', editingNominationId)
      .eq('coordinator_id', coordinatorId)
      .select('id, student_name, student_email, created_at, semester, nomination_status')
      .maybeSingle()
    setIsSavingNomination(false)
    if (error) {
      setNominationEditError(getDatabaseErrorMessage(error))
      return
    }
    if (!updatedNomination) {
      setNominationEditError('The nomination was not updated. It may have been removed or you may not have permission.')
      return
    }

    setNominations((currentNominations) => currentNominations.map(
      (nomination) => nomination.id === updatedNomination.id ? updatedNomination : nomination,
    ))
    setEditingNominationId(null)
    showSuccess('Nomination updated.')
  }

  const deleteNomination = async () => {
    if (!pendingDeleteNomination) return
    const coordinatorId = Number(profile.coordinator_id)
    if (!Number.isInteger(coordinatorId) || coordinatorId <= 0) {
      showError('Your coordinator profile could not be identified. Please sign in again.')
      return
    }

    clearStatus()
    setIsDeletingNomination(true)
    const { data: deletedNomination, error } = await supabase
      .from('studentnominations')
      .delete()
      .eq('id', pendingDeleteNomination.id)
      .eq('coordinator_id', coordinatorId)
      .select('id')
      .maybeSingle()
    setIsDeletingNomination(false)
    if (error) {
      showError(getDatabaseErrorMessage(error))
      return
    }
    if (!deletedNomination) {
      showError('The nomination was not deleted. It may have already been removed or you may not have permission.')
      return
    }

    setNominations((currentNominations) => currentNominations.filter(
      ({ id }) => id !== deletedNomination.id,
    ))
    if (editingNominationId === deletedNomination.id) setEditingNominationId(null)
    setPendingDeleteNomination(null)
    showSuccess('Nomination deleted.')
  }

  const visibleNominations = activeView === 'cycle-nominations' && selectedNominationCycle
    ? nominations.filter(({ semester }) => Number(semester) === Number(selectedNominationCycle.id))
    : nominations
  const visibleProgressNominations = progressCycle === 'all'
    ? nominations
    : nominations.filter(({ semester }) => Number(semester) === Number(progressCycle))

  return (
    <div className="portal-dashboard portal-dashboard--coordinator">
      {statusToast}
      {pendingDeleteCycle && (
        <ConfirmDialog
          id="cycle-delete"
          title="Delete KU semester?"
          error={status.error}
          busy={isDeletingCycle}
          confirmLabel="Delete cycle"
          busyLabel="Deleting cycle..."
          onConfirm={deleteExchangeCycle}
          onCancel={() => {
            setPendingDeleteCycle(null)
            clearStatus()
          }}
        >
          You’re about to permanently delete <strong>{pendingDeleteCycle.semester} {pendingDeleteCycle.academic_year}</strong>.
          Any student nominations linked to this cycle will also be deleted. This action cannot be undone.
        </ConfirmDialog>
      )}
      {pendingDeleteNomination && (
        <ConfirmDialog
          id="nomination-delete"
          title="Delete student nomination?"
          error={status.error}
          busy={isDeletingNomination}
          confirmLabel="Delete nomination"
          busyLabel="Deleting nomination..."
          onConfirm={deleteNomination}
          onCancel={() => {
            setPendingDeleteNomination(null)
            clearStatus()
          }}
        >
          Permanently delete the nomination for <strong>{pendingDeleteNomination.student_name}</strong>? This action cannot be undone.
        </ConfirmDialog>
      )}
      <aside className="portal-sidebar" aria-label="Coordinator portal navigation">
        <span className="portal-sidebar__eyebrow">Coordinator portal</span>
        <h1 className="portal-sidebar__title">KU Exchange</h1>
        <p className="portal-sidebar__welcome">Welcome, {profile.name}</p>
        <nav className="portal-sidebar__nav">
          {isKuCoordinator && (
            <button className={activeView === 'start' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => {
              clearStatus()
              setActiveView('start')
            }}>
              <span aria-hidden="true">＋</span> Start KU semester
            </button>
          )}
          <button className={activeView === 'manage' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('manage')}>
            <span aria-hidden="true">▦</span> Manage KU semester
          </button>
          <button className={activeView === 'nominations' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('nominations')}>
            <span aria-hidden="true">◌</span> Student nominations
          </button>
          <button className={activeView === 'account' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('account')}>
            <span aria-hidden="true">♙</span> My account
          </button>
          {!isKuCoordinator && (
            <button className={activeView === 'progress' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('progress')}>
              <span aria-hidden="true">▤</span> Nominee progress
            </button>
          )}
          {isKuCoordinator && (
            <button className={activeView === 'applications' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('applications')}>
              <span aria-hidden="true">▤</span> Applications
            </button>
          )}
          {isKuCoordinator && (
            <button className={activeView === 'send-update' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('send-update')}>
              <span aria-hidden="true">✉</span> Send an update
            </button>
          )}
          {isKuCoordinator && (
            <button className={activeView === 'withdrawals' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('withdrawals')}>
              <span aria-hidden="true">↩</span> Withdrawal requests
            </button>
          )}
          {isKuCoordinator && (
            <button className={activeView === 'support-requests' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('support-requests')}>
              <span aria-hidden="true">?</span> Support requests
            </button>
          )}
          {isKuCoordinator && (
            <button className={activeView === 'add-university' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('add-university')}>
              <span aria-hidden="true">⌖</span> Add university
            </button>
          )}
          {isKuCoordinator && (
            <button className={activeView === 'manage-universities' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('manage-universities')}>
              <span aria-hidden="true">✎</span> Manage universities
            </button>
          )}
          {isKuCoordinator && (
            <button className={activeView === 'subjects' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('subjects')}>
              <span aria-hidden="true">▥</span> CBA subjects
            </button>
          )}
          {isKuCoordinator && (
            <button className={activeView === 'coordinators' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('coordinators')}>
              <span aria-hidden="true">♙</span> Coordinator access
            </button>
          )}
          {isKuCoordinator && (
            <button className={activeView === 'maintenance' ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'} type="button" onClick={() => setActiveView('maintenance')}>
              <span aria-hidden="true">⚙</span> Maintenance mode
            </button>
          )}
          {isKuCoordinator && (
            <Link className="portal-sidebar__action" to="/testing-mode">
              <span aria-hidden="true">◉</span> Testing mode
            </Link>
          )}
          <SidebarHighlight activeView={activeView} />
        </nav>
        <div className="portal-sidebar__footer">
          <span className="portal-sidebar__secure">Signed in securely</span>
          {maintenanceMode && (
            <button className="btn btn--secondary" type="button" onClick={onSignOut}>Log out</button>
          )}
        </div>
      </aside>
      <section className="portal-card portal-card--wide portal-card--workspace">
        {activeView === 'account' && <Suspense fallback={null}><CoordinatorAccountSettings profile={profile} /></Suspense>}
        {isKuCoordinator && activeView === 'add-university' && <Suspense fallback={null}><AddPartnerUniversity /></Suspense>}
        {isKuCoordinator && activeView === 'manage-universities' && (
          <Suspense fallback={null}>
            <ManagePartnerUniversities fallbackCoordinates={partnerUniversityCoordinates} fallbackAirports={partnerUniversityAirports} />
          </Suspense>
        )}
        {isKuCoordinator && activeView === 'subjects' && <Suspense fallback={null}><SubjectImport /></Suspense>}
        {isKuCoordinator && activeView === 'start' && (
          <>
            <span className="auth-card__eyebrow">New cycle</span>
            <h2 id="portal-heading">Start a KU semester</h2>
            <p>Set the timetable for inbound nominations and exchange applications.</p>
            <CycleForm form={cycleForm} setForm={setCycleForm} onSubmit={startExchangeCycle} isSubmitting={isStartingCycle} status={status} submitLabel="Start KU semester" />
          </>
        )}
        {activeView === 'manage' && (
          <>
            <span className="auth-card__eyebrow">Cycle dashboard</span>
            <h2 id="portal-heading">Manage KU semesters</h2>
            <p>Review the schedules currently available to students and coordinators.</p>
            {status.error && <p className="auth-form__error" role="alert">{status.error}</p>}
            {cycles.length === 0 ? <div className="portal-empty-state">No KU semesters have been started yet.</div> : (
              <ul className="cycle-list">
                {cycles.map((cycle) => (
                  <li key={cycle.id} className="cycle-list__item">
                    {editingCycleId === cycle.id ? (
                      <CycleForm
                        form={cycleForm}
                        setForm={setCycleForm}
                        onSubmit={editExchangeCycle}
                        isSubmitting={isStartingCycle}
                        status={status}
                        submitLabel="Save changes"
                        onCancel={() => {
                          setEditingCycleId(null)
                          clearStatus()
                        }}
                      />
                    ) : (
                      <>
                        <div className="cycle-list__heading"><strong>{cycle.semester} {cycle.academic_year}</strong><span>Cycle #{cycle.id}</span></div>
                        <dl>
                          <div><dt>Nominations</dt><dd>{formatCycleDate(cycle.nominations_o)} – {formatCycleDate(cycle.nominations_c)}</dd></div>
                          <div><dt>Applications</dt><dd>{formatCycleDate(cycle.application_o)} – {formatCycleDate(cycle.application_c)}</dd></div>
                          <div><dt>KU semester</dt><dd>{formatCycleDate(cycle.cycle_start)} – {formatCycleDate(cycle.cycle_end)}</dd></div>
                        </dl>
                        <div className="cycle-list__actions">
                          {isKuCoordinator ? (
                            <>
                              <button
                                className="btn btn--secondary"
                                type="button"
                                onClick={() => {
                                  setCycleForm(cycleFormFromCycle(cycle))
                                  setEditingCycleId(cycle.id)
                                  clearStatus()
                                }}
                              >
                                Edit cycle
                              </button>
                              <button className="btn btn--danger" type="button" onClick={() => {
                                setPendingDeleteCycle(cycle)
                                clearStatus()
                              }}>
                                Delete cycle
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn btn--secondary"
                              type="button"
                              onClick={() => {
                                setSelectedNominationCycle(cycle)
                                setActiveView('cycle-nominations')
                              }}
                            >
                              View previous nominations
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {isKuCoordinator && activeView === 'withdrawals' && (
          <>
            <span className="auth-card__eyebrow">Application review</span>
            <h2 id="portal-heading">Withdrawal requests</h2>
            <p>Review withdrawal requests from students and decide whether to approve them.</p>
            {status.error && <p className="auth-form__error" role="alert">{status.error}</p>}
            {isLoadingWithdrawals ? <p role="status">Loading withdrawal requests...</p>
              : withdrawalRequests.length === 0 ? <div className="portal-empty-state">No withdrawal requests are waiting for review.</div> : (
                <div className="cycle-list">
                  {withdrawalRequests.map((application) => {
                    const withdrawalKey = `${application.application_type}-${application.application_id}`
                    const cycle = semesters.find(({ id }) => Number(id) === Number(application.semester_applied_for))
                    const university = partnerUniversities.find(
                      ({ university_id }) => Number(university_id) === Number(application.university_id),
                    )
                    return (
                      <article className="cycle-list__item" key={withdrawalKey}>
                        <div className="cycle-list__heading">
                          <strong>{application.application_type === 'inbound' ? 'Inbound' : 'Outbound'} application #{application.application_id}</strong>
                          <span>{application.student?.name || 'Student name unavailable'}</span>
                        </div>
                        <details className="withdrawal-review-details">
                          <summary>Review request details</summary>
                          <dl>
                            <div><dt>Student email</dt><dd>{application.student?.student_email || 'Unavailable'}</dd></div>
                            <div><dt>Student ID</dt><dd>{application.student_id || 'Unavailable'}</dd></div>
                            <div><dt>Application status</dt><dd>{application.application_status}</dd></div>
                            <div><dt>Previous status</dt><dd>{application.withdrawal_previous_status || 'Unavailable'}</dd></div>
                            <div><dt>KU semester</dt><dd>{cycle ? `${cycle.semester} ${cycle.academic_year}` : `Cycle #${application.semester_applied_for || 'Unavailable'}`}</dd></div>
                            <div><dt>Destination university</dt><dd>{university?.name || 'Unavailable'}</dd></div>
                            <div><dt>Submitted</dt><dd>{formatCycleDate(application.submitted_at)}</dd></div>
                            <div><dt>Withdrawal reason</dt><dd>{application.withdrawal_reason || 'No reason provided'}</dd></div>
                            <div><dt>Requested</dt><dd>{formatCycleDate(application.status_updated_at)}</dd></div>
                          </dl>
                          <div className="cycle-list__actions">
                            <button
                              className="btn btn--primary"
                              type="button"
                              onClick={() => reviewWithdrawal(application, true)}
                              disabled={reviewingWithdrawalKey !== null}
                            >
                              {reviewingWithdrawalKey === withdrawalKey ? 'Processing...' : 'Approve withdrawal'}
                            </button>
                            <button
                              className="btn btn--secondary"
                              type="button"
                              onClick={() => reviewWithdrawal(application, false)}
                              disabled={reviewingWithdrawalKey !== null}
                            >
                              Reject withdrawal
                            </button>
                          </div>
                        </details>
                      </article>
                    )
                  })}
                </div>
              )}
          </>
        )}
        {isKuCoordinator && activeView === 'applications' && <Suspense fallback={null}><CoordinatorApplications /></Suspense>}
        {isKuCoordinator && activeView === 'support-requests' && <Suspense fallback={null}><CoordinatorSupportRequests /></Suspense>}
        {isKuCoordinator && activeView === 'send-update' && <Suspense fallback={null}><SendApplicationUpdate /></Suspense>}
        {!isKuCoordinator && activeView === 'progress' && (
          <section aria-labelledby="progress-heading">
            <span className="auth-card__eyebrow">Nomination tracking</span>
            <h2 id="progress-heading">Nominee application progress</h2>
            <p>Track application status for students you nominated.</p>
            <div className="progress-filter">
              <label htmlFor="progress-cycle">KU semester</label>
              <select
                id="progress-cycle"
                value={progressCycle}
                onChange={(event) => setProgressCycle(event.target.value)}
              >
                <option value="all">All cycles</option>
                {cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.semester} {cycle.academic_year}
                  </option>
                ))}
              </select>
            </div>
            {(progressError || status.error) && (
              <p className="auth-form__error" role="alert">{progressError || status.error}</p>
            )}
            {isLoadingNominations || isLoadingProgress ? <p role="status">Loading nominee progress...</p>
              : visibleProgressNominations.length === 0 ? <p>No nominations found for this KU semester.</p> : (
                <div className="nomination-table-wrap">
                  <table className="nomination-table">
                    <thead>
                      <tr>
                        <th scope="col">Student</th>
                        <th scope="col">Email</th>
                        <th scope="col">Cycle</th>
                        <th scope="col">Nomination status</th>
                        <th scope="col">Application progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProgressNominations.map((nomination) => {
                        const cycle = cycles.find(({ id }) => Number(id) === Number(nomination.semester))
                        const applicationStatus = progressError
                          ? 'Unavailable'
                          : applicationStatuses[nomination.id] || 'Not started'
                        return (
                          <tr key={nomination.id}>
                            <th scope="row">{nomination.student_name}</th>
                            <td>{nomination.student_email}</td>
                            <td>{cycle ? `${cycle.semester} ${cycle.academic_year}` : `Cycle #${nomination.semester}`}</td>
                            <td>{nomination.nomination_status}</td>
                            <td>{applicationStatus}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </section>
        )}
        {(activeView === 'nominations' || activeView === 'cycle-nominations') && (
          <>
            <span className="auth-card__eyebrow">Student nominations</span>
            {activeView === 'cycle-nominations' && selectedNominationCycle ? (
              <>
                <h2 id="portal-heading">
                  Previous nominations for {selectedNominationCycle.semester} {selectedNominationCycle.academic_year}
                </h2>
                <p>These are the nominations submitted for this KU semester.</p>
                <button className="btn btn--secondary" type="button" onClick={() => setActiveView('manage')}>
                  Back to KU semesters
                </button>
              </>
            ) : !isKuCoordinator && (
              <>
                <h2 id="portal-heading">Submit a student nomination</h2>
                <p>Submit and review student nominations for your university.</p>
                <form className="nomination-form" onSubmit={submitNomination}>
                  <label htmlFor="studentName">Student name</label>
                  <input id="studentName" value={form.studentName} onChange={(event) => setForm({ ...form, studentName: event.target.value })} required />
                  <label htmlFor="studentEmail">Student email</label>
                  <input id="studentEmail" type="email" value={form.studentEmail} onChange={(event) => setForm({ ...form, studentEmail: event.target.value })} required />
                  <label htmlFor="semester">Exchange semester</label>
                  <select id="semester" value={form.semester} onChange={(event) => setForm({ ...form, semester: event.target.value })} required>
                    <option value="">Choose a semester</option>
                    {semesters.map((semester) => (
                      <option key={semester.id} value={semester.id}>
                        {semester.semester} {semester.academic_year}
                      </option>
                    ))}
                  </select>
                  {status.error && <p className="auth-form__error" role="alert">{status.error}</p>}
                  <button className="btn btn--primary" type="submit">Submit nomination</button>
                </form>
              </>
            )}
            <h2 className="portal-section-heading">Submitted nominations</h2>
        {editingNominationId !== null && (
          <form className="nomination-form nomination-edit-form" onSubmit={saveNomination}>
            <h3>Edit nomination</h3>
            <label htmlFor="edit-student-name">Student name</label>
            <input
              id="edit-student-name"
              value={nominationEditForm.studentName}
              onChange={(event) => setNominationEditForm({ ...nominationEditForm, studentName: event.target.value })}
              required
            />
            <label htmlFor="edit-student-email">Student email</label>
            <input
              id="edit-student-email"
              type="email"
              value={nominationEditForm.studentEmail}
              onChange={(event) => setNominationEditForm({ ...nominationEditForm, studentEmail: event.target.value })}
              required
            />
            <label htmlFor="edit-nomination-semester">Exchange semester</label>
            <select
              id="edit-nomination-semester"
              value={nominationEditForm.semester}
              onChange={(event) => setNominationEditForm({ ...nominationEditForm, semester: event.target.value })}
              required
            >
              <option value="">Choose a semester</option>
              {semesters.map((semester) => (
                <option key={semester.id} value={semester.id}>
                  {semester.semester} {semester.academic_year}
                </option>
              ))}
            </select>
            {nominationEditError && <p className="auth-form__error" role="alert">{nominationEditError}</p>}
            <div className="cycle-form__actions">
              <button className="btn btn--primary" type="submit" disabled={isSavingNomination}>
                {isSavingNomination ? 'Saving changes...' : 'Save changes'}
              </button>
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() => {
                  setEditingNominationId(null)
                  setNominationEditError('')
                }}
                disabled={isSavingNomination}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {isLoadingNominations ? <p role="status">Loading submitted nominations...</p>
          : visibleNominations.length === 0 ? <p>{activeView === 'cycle-nominations' ? 'No nominations submitted for this KU semester.' : 'No nominations submitted yet.'}</p> : (
            <div className="nomination-table-wrap">
              <table className="nomination-table">
                <thead>
                  <tr>
                    <th scope="col">Nomination ID</th>
                    <th scope="col">Student</th>
                    <th scope="col">Email</th>
                    <th scope="col">Exchange semester</th>
                    <th scope="col">Status</th>
                    <th scope="col">Submitted</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleNominations.map((nomination) => {
                    const semester = semesters.find(({ id }) => Number(id) === Number(nomination.semester))
                    return (
                      <tr key={nomination.id}>
                        <td>{nomination.id}</td>
                        <th scope="row">{nomination.student_name}</th>
                        <td>{nomination.student_email}</td>
                        <td>{semester ? `${semester.semester} ${semester.academic_year}` : `Cycle #${nomination.semester}`}</td>
                        <td>{nomination.nomination_status}</td>
                        <td>{formatCycleDate(nomination.created_at)}</td>
                        <td>
                          <div className="nomination-table__actions">
                            <button
                              className="btn btn--secondary"
                              type="button"
                              onClick={() => {
                                setEditingNominationId(nomination.id)
                                setNominationEditForm({
                                  studentName: nomination.student_name,
                                  studentEmail: nomination.student_email,
                                  semester: String(nomination.semester),
                                })
                                setNominationEditError('')
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn--danger"
                              type="button"
                              onClick={() => {
                                setPendingDeleteNomination(nomination)
                                clearStatus()
                              }}
                            >
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
        )}
        {isKuCoordinator && activeView === 'coordinators' && (
          <>
            <span className="auth-card__eyebrow">Access control</span>
            <h2 id="portal-heading">Coordinator access</h2>
            <p>Review partner coordinator accounts and access requests.</p>
            {status.error && <p className="auth-form__error" role="alert">{status.error}</p>}
            {isLoadingCoordinators ? <p role="status">Loading coordinator accounts...</p>
              : coordinators.length === 0 ? <p>No other coordinator accounts found.</p> : (
                <div className="nomination-table-wrap">
                  <table className="nomination-table">
                    <thead>
                      <tr>
                        <th scope="col">Coordinator</th>
                        <th scope="col">Email</th>
                        <th scope="col">University</th>
                        <th scope="col">Access</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coordinators.map((coordinator) => {
                        const university = partnerUniversities.find(({ university_id }) => Number(university_id) === Number(coordinator.university))
                        const universityDeleted = Boolean(university?.deleted_at)
                        return (
                          <tr key={coordinator.coordinator_id}>
                            <th scope="row">{coordinator.name}</th>
                            <td>{coordinator.email}</td>
                            <td>{university?.name || `University #${coordinator.university}`}</td>
                            <td>{universityDeleted ? 'University deleted' : coordinator.email_accepted ? 'Granted' : 'Requested'}</td>
                            <td>
                              <div className="nomination-table__actions">
                                {!coordinator.email_accepted && !universityDeleted && (
                                  <button className="btn btn--secondary" type="button" onClick={() => updateCoordinatorAccess(coordinator, true)}>
                                    Accept
                                  </button>
                                )}
                                <button className="btn btn--danger" type="button" onClick={() => updateCoordinatorAccess(coordinator, false)}>
                                  Refuse
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
        )}
        {isKuCoordinator && activeView === 'maintenance' && (
          <section className="maintenance-panel" aria-labelledby="maintenance-toggle-heading">
            <div className="maintenance-panel__header">
              <div>
                <span className="auth-card__eyebrow">Website status</span>
                <h2 id="maintenance-toggle-heading">Maintenance mode</h2>
              </div>
              <span className={maintenanceMode === null ? 'maintenance-panel__badge' : maintenanceMode ? 'maintenance-panel__badge maintenance-panel__badge--enabled' : 'maintenance-panel__badge maintenance-panel__badge--disabled'}>
                {maintenanceMode === null ? 'Unavailable' : maintenanceMode ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="maintenance-panel__copy">
              Current status: <strong>{maintenanceMode === null ? 'Unavailable' : maintenanceMode ? 'Enabled' : 'Disabled'}</strong>
            </p>
            <button className={maintenanceMode ? 'btn btn--secondary' : 'btn btn--primary'} type="button" onClick={handleMaintenanceToggle} disabled={maintenanceMode === null || isUpdatingMaintenance}>
              {isUpdatingMaintenance ? 'Updating status...' : maintenanceMode ? 'Disable maintenance mode' : 'Enable maintenance mode'}
            </button>
            {maintenanceMode === null && <button className="btn btn--secondary" type="button" onClick={onRetryMaintenanceStatus}>Retry status check</button>}
            {maintenanceError && <p className="auth-form__error" role="alert">{maintenanceError}</p>}
          </section>
        )}
        {activeView === 'account' && <AccountDeleteButton onDeleted={onDeleted} />}
      </section>
    </div>
  )
}

function CoordinatorAccessPending({ user, universityId, onSignOut, onDeleted }) {
  const [deletedUniversity, setDeletedUniversity] = useState(null)

  useEffect(() => {
    let isCurrent = true
    supabase
      .from('partneruniversity')
      .select('name, deleted_at')
      .eq('university_id', universityId)
      .maybeSingle()
      .then(({ data }) => {
        if (isCurrent && data?.deleted_at) setDeletedUniversity(data.name)
      })
    return () => {
      isCurrent = false
    }
  }, [universityId])

  if (deletedUniversity) {
    return (
      <section className="portal-page" aria-labelledby="access-pending-heading">
        <div className="portal-card">
          <span className="auth-card__eyebrow">Access removed</span>
          <h1 id="access-pending-heading">Your university is no longer a partner</h1>
          <p>
            <strong dir="auto">{deletedUniversity}</strong> has been removed from the Kuwait University exchange
            programme, so coordinator access for <strong>{user.email}</strong> has ended.
          </p>
          <button className="btn btn--secondary" type="button" onClick={onSignOut}>Log out</button>
          <AccountDeleteButton onDeleted={onDeleted} />
        </div>
      </section>
    )
  }

  return (
    <section className="portal-page" aria-labelledby="access-pending-heading">
      <div className="portal-card">
        <span className="auth-card__eyebrow">Access pending</span>
        <h1 id="access-pending-heading">Your coordinator access is being reviewed</h1>
        <p>
          Your request for <strong>{user.email}</strong> has been sent to a Kuwait University coordinator.
          You will be notified as soon as your access is granted.
        </p>
        <button className="btn btn--secondary" type="button" onClick={onSignOut}>Log out</button>
        <AccountDeleteButton onDeleted={onDeleted} />
      </div>
    </section>
  )
}

export default function ProtectedPortal({ onSignOut, onDeleted, onRetryMaintenanceStatus, passwordOnly = false }) {
  const user = useAppStore((state) => state.session?.user)
  const profile = useAppStore((state) => state.profile)

  if (!user) return <Navigate to="/auth/signin" replace />
  if (passwordOnly && !profile) return <section className="portal-page"><div className="portal-card"><p role="status">Loading coordinator account...</p></div></section>
  if (passwordOnly && profile?.role !== 'coordinator') return <Navigate to="/portal" replace />

  if (profile?.role === 'coordinator') {
    const isKuCoordinator = isKuCoordinatorProfile(profile, user.email)
    if (!isKuCoordinator && profile.email_accepted !== true) {
      return <CoordinatorAccessPending user={user} universityId={profile.university} onSignOut={onSignOut} onDeleted={onDeleted} />
    }
    if (passwordOnly) return <CoordinatorPasswordPage />
    return <CoordinatorPortal onDeleted={onDeleted} onSignOut={onSignOut} onRetryMaintenanceStatus={onRetryMaintenanceStatus} />
  }

  return <StudentPortal user={user} profile={profile} onSignOut={onSignOut} onDeleted={onDeleted} />
}

const studentPortalViews = [
  { id: 'home', icon: '⌂', label: 'Home' },
  { id: 'inbox', icon: '✉', label: 'Inbox' },
  { id: 'support', icon: '?', label: 'Contact the office', role: 'incoming' },
  { id: 'account', icon: '♙', label: 'My account' },
]

function StudentPortal({ user, profile, onSignOut, onDeleted }) {
  const [activeView, setActiveView] = useState('home')
  // Only a saved KU or incoming student profile has an inbox and details to edit.
  const isStudent = profile?.role === 'incoming' || profile?.role === 'ku'
  const name = profile?.name || user.user_metadata?.name || user.email
  const application = profile?.role === 'incoming'
    ? { to: '/portal/inbound-application', label: 'Inbound application' }
    : profile?.role === 'ku'
      ? { to: '/portal/outbound-application', label: 'Outbound application' }
      : null
  const views = isStudent
    ? studentPortalViews.filter((view) => !view.role || view.role === profile.role)
    : studentPortalViews.filter((view) => view.id === 'home')
  const shownView = views.some((view) => view.id === activeView) ? activeView : 'home'

  return (
    <div className="portal-dashboard portal-dashboard--student">
      <aside className="portal-sidebar" aria-label="Student portal navigation">
        <span className="portal-sidebar__eyebrow">
          {profile?.role === 'ku' ? 'KU student portal' : profile?.role === 'incoming' ? 'Incoming student portal' : 'Student portal'}
        </span>
        <h1 className="portal-sidebar__title">KU Exchange</h1>
        <p className="portal-sidebar__welcome">Welcome, {name}</p>
        <nav className="portal-sidebar__nav">
          {views.map((view) => (
            <button
              key={view.id}
              className={shownView === view.id ? 'portal-sidebar__action portal-sidebar__action--active' : 'portal-sidebar__action'}
              type="button"
              aria-current={shownView === view.id ? 'page' : undefined}
              onClick={() => setActiveView(view.id)}
            >
              <span aria-hidden="true">{view.icon}</span> {view.label}
            </button>
          ))}
          {application && (
            <Link className="portal-sidebar__action" to={application.to}>
              <span aria-hidden="true">▤</span> {application.label}
            </Link>
          )}
          {profile?.role === 'incoming' && (
            <Link className="portal-sidebar__action" to="/portal/subjects">
              <span aria-hidden="true">▥</span> CBA subjects
            </Link>
          )}
          <SidebarHighlight activeView={shownView} />
        </nav>
        <div className="portal-sidebar__footer">
          <span className="portal-sidebar__secure">Signed in securely</span>
          <button className="btn btn--secondary" type="button" onClick={onSignOut}>Log out</button>
        </div>
      </aside>
      <section className="portal-card portal-card--wide portal-card--workspace">
        {shownView === 'home' && (
          <>
            <span className="auth-card__eyebrow">Secure portal</span>
            <h2 id="portal-heading">Welcome, {name}</h2>
            <p>You are signed in as <strong>{user.email}</strong>.</p>
            {application && (
              <div className="portal-actions student-portal__actions">
                <Link className="btn btn--primary" to={application.to}>{application.label}</Link>
              </div>
            )}
          </>
        )}
        {shownView === 'inbox' && (
          <>
            <span className="auth-card__eyebrow">Messages</span>
            <h2>Inbox</h2>
            <Suspense fallback={null}><StudentInbox role={profile.role} /></Suspense>
          </>
        )}
        {shownView === 'support' && <Suspense fallback={null}><SupportRequests profile={profile} /></Suspense>}
        {shownView === 'account' && (
          <>
            <Suspense fallback={null}><StudentAccount profile={profile} /></Suspense>
            <AccountDeleteButton onDeleted={onDeleted} />
          </>
        )}
      </section>
    </div>
  )
}
