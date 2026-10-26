import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Link, useNavigate } from 'react-router-dom'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../js/config.js'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { supabase } from '../supabase'
import { useAppStore } from '../stores/appStore'
import './TestingMode.css'

const accountDefinitions = [
  {
    role: 'ku',
    userType: 'ku',
    label: 'John Doe (KU Student)',
    name: 'John Doe',
    emailDomain: 'ku.edu.kw',
    table: 'kustudentauth',
  },
  {
    role: 'incoming',
    userType: 'incoming',
    label: 'Jane Smith (Incoming Student)',
    name: 'Jane Smith',
    emailDomain: 'gmail.com',
    table: 'incomingstudentauth',
  },
  {
    role: 'ku-no-application',
    userType: 'ku',
    label: 'Alex Johnson (KU Student No Application Version)',
    name: 'Alex Johnson',
    emailDomain: 'ku.edu.kw',
    table: 'kustudentauth',
  },
  {
    role: 'coordinator',
    userType: 'coordinator',
    label: 'Michael Brown (Partner Coordinator)',
    name: 'Michael Brown',
    emailDomain: 'gmail.com',
    table: 'coordinator',
  },
]

function randomHex(byteCount = 16) {
  const values = crypto.getRandomValues(new Uint8Array(byteCount))
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('')
}

function randomNumber(minimum, maximum) {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return minimum + (values[0] % (maximum - minimum + 1))
}

function shiftedDate(days) {
  const value = new Date()
  value.setDate(value.getDate() + days)
  return value
}

function databaseTimestamp(date) {
  return date.toISOString()
}

function makeTestClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

async function savePublicAccounts(accounts) {
  const { error } = await supabase.rpc('save_testing_accounts', {
    requested_accounts: accounts,
  })
  if (error) throw new Error(getDatabaseErrorMessage(error))
}

async function createTestingAccount(definition, universityId, accounts) {
  const client = makeTestClient()
  const identifier = randomHex(12)
  const email = `test-${identifier}@${definition.emailDomain}`
  const password = `${randomHex(24)}Aa1!`
  const profileId = randomNumber(100000000, 999999999)
  const name = definition.name
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { name, student_id: profileId, user_type: definition.userType },
    },
  })

  if (error) throw new Error(getDatabaseErrorMessage(error))
  if (!data.user || !data.session) {
    throw new Error('Supabase did not start a session for the generated account. Check that email confirmation is disabled.')
  }

  const profile = definition.userType === 'coordinator'
    ? {
        coordinator_id: profileId,
        name,
        email,
        university: universityId,
        email_accepted: true,
        user_id: data.user.id,
      }
    : {
        student_id: profileId,
        student_email: email,
        name,
        user_id: data.user.id,
      }

  const { error: profileError } = await client.from(definition.table).insert(profile)
  if (profileError) {
    const { error: deleteError } = await client.rpc('delete_my_account')
    const cleanupMessage = deleteError
      ? ` The incomplete Auth account could not be removed: ${getDatabaseErrorMessage(deleteError)}`
      : ''
    throw new Error(`${getDatabaseErrorMessage(profileError)}${cleanupMessage}`)
  }

  const account = {
    role: definition.role,
    label: definition.label,
    name: definition.name,
    email,
    password,
  }
  const nextAccounts = [...accounts, account]
  await savePublicAccounts(nextAccounts)
  return { account, profileId, email, client, accounts: nextAccounts }
}

async function createTestingCycle() {
  const { data: latest, error: latestError } = await supabase
    .from('exchange_cycle')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestError) throw new Error(getDatabaseErrorMessage(latestError))

  const now = new Date()
  const closeDate = shiftedDate(30)
  const cycleEnd = shiftedDate(365)
  const academicYear = `${now.getFullYear()}/${now.getFullYear() + 1}`
  const cycle = {
    id: (latest?.id ?? 0) + 1,
    semester: now.getMonth() >= 6 && now.getMonth() <= 11 ? 'Fall' : 'Spring',
    academic_year: academicYear,
    nominations_o: databaseTimestamp(shiftedDate(-1)),
    nominations_c: databaseTimestamp(closeDate),
    application_o: databaseTimestamp(shiftedDate(-1)),
    application_c: databaseTimestamp(closeDate),
    cycle_start: databaseTimestamp(shiftedDate(-1)),
    cycle_end: databaseTimestamp(cycleEnd),
  }

  const { error } = await supabase.from('exchange_cycle').insert(cycle)
  if (error) throw new Error(getDatabaseErrorMessage(error))
  return cycle
}

async function signInTestAccount(account) {
  const client = makeTestClient()
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })
  if (error) {
    await client.auth.signOut()
    throw new Error(getDatabaseErrorMessage(error))
  }
  return client
}

async function createTestingNomination(coordinatorClient, coordinatorId, cycleId, student) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const nomination = {
      id: randomNumber(10000000, 99999999),
      coordinator_id: coordinatorId,
      student_name: student.name,
      student_email: student.email,
      student_nationality: 'Test Nationality',
      semester: cycleId,
    }
    const { error } = await coordinatorClient.from('studentnominations').insert(nomination)
    if (!error) return nomination
    if (error.code !== '23505') throw new Error(getDatabaseErrorMessage(error))
  }
  throw new Error('A unique testing nomination ID could not be generated.')
}

async function createSubmittedInboundApplication(studentClient, studentId, email, name, cycleId, nominationId) {
  const [firstName, ...lastNameParts] = name.split(' ')
  const draft = {
    application_id: randomNumber(100000000, 999999999),
    first_name: firstName,
    last_name: lastNameParts.join(' '),
    email,
    semester_applied_for: cycleId,
    student_id: studentId,
    nomination_id: nominationId,
    application_status: 'Draft',
    tos: false,
  }
  const { error: insertError } = await studentClient.from('inboundapplication').insert(draft)
  if (insertError) throw new Error(getDatabaseErrorMessage(insertError))

  const { error: submitError } = await studentClient
    .from('inboundapplication')
    .update({
      application_status: 'Submitted',
      submitted_at: new Date().toISOString(),
      tos: true,
    })
    .eq('application_id', draft.application_id)
  if (submitError) throw new Error(getDatabaseErrorMessage(submitError))
}

async function createSubmittedOutboundApplication(studentClient, studentId, name, cycleId, universityId) {
  const [firstName, ...lastNameParts] = name.split(' ')
  const draft = {
    application_id: Number(`${Date.now()}${randomNumber(100, 999)}`),
    first_name: firstName,
    last_name: lastNameParts.join(' '),
    gender: 'Female',
    birthdate: '2004-01-01',
    gpa: 3.5,
    expected_graduation_semester: databaseTimestamp(shiftedDate(365)).slice(0, 10),
    credits_passed: 75,
    major: 'Business Administration',
    current_year_of_study: 'Third year',
    english_test_type: 'None',
    english_106_completed: true,
    tos: false,
    university_id: universityId,
    semester_applied_for: cycleId,
    student_id: studentId,
    application_status: 'Draft',
  }
  const { error: insertError } = await studentClient.from('outboundapplication').insert(draft)
  if (insertError) throw new Error(getDatabaseErrorMessage(insertError))

  const { error: submitError } = await studentClient
    .from('outboundapplication')
    .update({
      application_status: 'Submitted',
      submitted_at: new Date().toISOString(),
      tos: true,
    })
    .eq('application_id', draft.application_id)
  if (submitError) throw new Error(getDatabaseErrorMessage(submitError))
}

async function provisionTestingScenario() {
  const { data: university, error: universityError } = await supabase
    .from('partneruniversity')
    .select('university_id')
    .eq('available', true)
    .neq('university_id', 4)
    .order('university_id')
    .limit(1)
    .maybeSingle()

  if (universityError) throw new Error(getDatabaseErrorMessage(universityError))
  if (!university) throw new Error('Add an available partner university before starting testing mode.')

  const cycle = await createTestingCycle()
  let accounts = []
  const created = []

  for (const definition of accountDefinitions) {
    const result = await createTestingAccount(definition, university.university_id, accounts)
    accounts = result.accounts
    created.push(result)
  }

  const coordinator = created.find(({ account }) => account.role === 'coordinator')
  const incoming = created.find(({ account }) => account.role === 'incoming')
  const kuStudent = created.find(({ account }) => account.role === 'ku')
  const coordinatorClient = await signInTestAccount(coordinator.account)
  const nomination = await createTestingNomination(
    coordinatorClient,
    coordinator.profileId,
    cycle.id,
    { name: incoming.account.name, email: incoming.email },
  )
  await createSubmittedInboundApplication(
    await signInTestAccount(incoming.account),
    incoming.profileId,
    incoming.email,
    incoming.account.name,
    cycle.id,
    nomination.id,
  )
  await createSubmittedOutboundApplication(
    await signInTestAccount(kuStudent.account),
    kuStudent.profileId,
    kuStudent.account.name,
    cycle.id,
    university.university_id,
  )

  return accounts
}

export default function TestingMode({
  isKuCoordinator,
  maintenanceMode,
  onTestingModeChanged,
}) {
  const navigate = useNavigate()
  const setAuthType = useAppStore((state) => state.setAuthType)
  const [enabled, setEnabled] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busyAction, setBusyAction] = useState(null)
  const busy = busyAction !== null
  const [loading, setLoading] = useState(true)

  const fetchTestingState = useCallback(async () => (
    await supabase
      .from('testing')
      .select('enabled, test_accounts')
      .eq('id', 1)
      .single()
  ), [])

  const loadTestingState = useCallback(async () => {
    const { data, error: stateError } = await fetchTestingState()
    if (stateError) {
      setError(getDatabaseErrorMessage(stateError))
      setLoading(false)
      return
    }
    const loadedAccounts = Array.isArray(data.test_accounts) ? data.test_accounts : []
    setEnabled(data.enabled)
    setAccounts(loadedAccounts)
    onTestingModeChanged(data.enabled)
    setLoading(false)
  }, [fetchTestingState, onTestingModeChanged])

  useEffect(() => {
    let isCurrent = true
    fetchTestingState().then(({ data, error: stateError }) => {
      if (!isCurrent) return
      if (stateError) {
        setError(getDatabaseErrorMessage(stateError))
        setLoading(false)
        return
      }
      const loadedAccounts = Array.isArray(data.test_accounts) ? data.test_accounts : []
      setEnabled(data.enabled)
      setAccounts(loadedAccounts)
      onTestingModeChanged(data.enabled)
      setLoading(false)
    })
    return () => {
      isCurrent = false
    }
  }, [fetchTestingState, onTestingModeChanged])

  const startTesting = async () => {
    setError('')
    setMessage('')
    setBusyAction('starting')
    const { error: startError } = await supabase.rpc('set_testing_mode', {
      requested_mode: true,
    })
    if (startError) {
      setError(getDatabaseErrorMessage(startError))
      setBusyAction(null)
      return
    }
    setEnabled(true)
    onTestingModeChanged(true)

    try {
      const generatedAccounts = await provisionTestingScenario()
      setAccounts(generatedAccounts)
      setMessage('Testing accounts, exchange cycle, and submitted applications are ready.')
    } catch (setupError) {
      setError(setupError.message || getDatabaseErrorMessage(setupError))
    }
    await loadTestingState()
    setBusyAction(null)
  }

  const endTesting = async () => {
    setError('')
    setMessage('')
    setBusyAction('ending')
    const { data: objects, error: objectsError } = await supabase.rpc('get_testing_storage_objects')
    if (objectsError) {
      setError(getDatabaseErrorMessage(objectsError))
      setBusyAction(null)
      return
    }

    const filesByBucket = (objects || []).reduce((groups, object) => {
      groups[object.bucket_id] ||= []
      groups[object.bucket_id].push(object.object_name)
      return groups
    }, {})

    for (const [bucket, paths] of Object.entries(filesByBucket)) {
      const { error: removeError } = await supabase.storage.from(bucket).remove(paths)
      if (removeError) {
        setError(`Testing data was not removed because uploaded files could not be deleted: ${getDatabaseErrorMessage(removeError)}`)
        setBusyAction(null)
        return
      }
    }

    const { error: cleanupError } = await supabase.rpc('set_testing_mode', {
      requested_mode: false,
    })
    if (cleanupError) {
      setError(getDatabaseErrorMessage(cleanupError))
      setBusyAction(null)
      return
    }
    setEnabled(false)
    setAccounts([])
    setMessage('Testing mode is off. Registered test data and accounts were removed.')
    onTestingModeChanged(false)
    await loadTestingState()
    setBusyAction(null)
  }

  const switchAccount = async (account) => {
    setError('')
    setMessage('')
    setBusyAction('switching')
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      setError(getDatabaseErrorMessage(signOutError))
      setBusyAction(null)
      return
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    })
    if (signInError) setError(getDatabaseErrorMessage(signInError))
    setBusyAction(null)
  }

  const switchToCoordinator = async () => {
    setError('')
    setBusyAction('switching')
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      setError(getDatabaseErrorMessage(signOutError))
      setBusyAction(null)
      return
    }
    setAuthType('coordinator')
    navigate('/auth/signin')
  }

  return (
    <section className="testing-page" aria-labelledby="testing-heading">
      <div className="testing-card">
        <span className="auth-card__eyebrow">Safe demonstration environment</span>
        <h1 id="testing-heading">Testing mode</h1>
        <p className="testing-card__intro">
          Generated accounts can change only records created while testing mode is on.
          Turning it off removes registered test data and the generated accounts.
        </p>

        {loading ? (
          <p role="status">Checking testing mode...</p>
        ) : error && !enabled ? (
          <p className="auth-form__error" role="alert">{error}</p>
        ) : maintenanceMode ? (
          <div className="testing-notice" role="status">
            Maintenance mode takes precedence. Turn it off from the KU coordinator portal before using testing mode.
          </div>
        ) : (
          <>
            <div className={`testing-status testing-status--${enabled ? 'enabled' : 'disabled'}`} role="status">
              <span className="testing-status__dot" aria-hidden="true" />
              Testing mode is {enabled ? 'on' : 'off'}
            </div>

            {isKuCoordinator && !enabled && (
              <button
                className="btn btn--primary"
                type="button"
                onClick={startTesting}
                disabled={busy}
                aria-busy={busyAction === 'starting'}
              >
                {busyAction === 'starting' && <span className="testing-spinner" aria-hidden="true" />}
                {busyAction === 'starting' ? 'Preparing test data...' : 'Start testing mode'}
              </button>
            )}

            {isKuCoordinator && enabled && (
              <div className="testing-admin">
                {accounts.length === 0 && (
                  busyAction === 'starting' ? (
                    <p className="testing-notice" role="status" aria-busy="true">
                      <span className="testing-spinner" aria-hidden="true" />
                      Setting up testing data...
                    </p>
                  ) : (
                    <p className="testing-notice" role="alert">
                      Setup did not finish. End testing mode to remove any partial data, then start again.
                    </p>
                  )
                )}
                <button className="btn btn--danger" type="button" onClick={endTesting} disabled={busy}>
                  {busyAction === 'ending' ? 'Removing test data...' : 'End testing and remove test data'}
                </button>
              </div>
            )}

            {enabled && (
              <section className="testing-accounts" aria-labelledby="testing-accounts-heading">
                <h2 id="testing-accounts-heading">Switch testing user</h2>
                <p>Choose a role to sign out and continue as that generated testing user.</p>
                {accounts.length === 0 ? (
                  <p>Testing accounts are still being prepared by a KU coordinator.</p>
                ) : (
                  <div className="testing-account-list">
                    {accounts.map((account) => (
                      <button
                        className="testing-account"
                        key={account.role}
                        type="button"
                        onClick={() => switchAccount(account)}
                        disabled={busy}
                      >
                        <strong>{account.label}</strong>
                        <span>{account.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button className="btn btn--secondary" type="button" onClick={switchToCoordinator} disabled={busy}>
                  Switch to KU coordinator
                </button>
              </section>
            )}
          </>
        )}

        {error && enabled && <p className="auth-form__error" role="alert">{error}</p>}
        {message && <p className="testing-message" role="status">{message}</p>}
        {isKuCoordinator && maintenanceMode && (
          <Link className="btn btn--secondary" to="/portal">Open KU coordinator portal</Link>
        )}
      </div>
    </section>
  )
}
