import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Link, useNavigate } from 'react-router-dom'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../js/config.js'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { supabase } from '../supabase'
import { forgetReferenceData } from '../referenceData'
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
    role: 'incoming-no-application',
    userType: 'incoming',
    label: 'Emma Wilson (Incoming Student, No Application)',
    name: 'Emma Wilson',
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

  // A coordinator cannot approve themselves (issue #190), so the KU coordinator running testing
  // mode approves the generated partner coordinator, the way they would approve a real one.
  if (definition.userType === 'coordinator') {
    const { data: approved, error: approvalError } = await supabase
      .from('coordinator')
      .update({ email_accepted: true })
      .eq('coordinator_id', profileId)
      .select('coordinator_id')
      .maybeSingle()
    if (approvalError) throw new Error(getDatabaseErrorMessage(approvalError))
    if (!approved) throw new Error('The generated partner coordinator could not be approved.')
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
    nominations_o: databaseTimestamp(shiftedDate(-70)),
    nominations_c: databaseTimestamp(closeDate),
    application_o: databaseTimestamp(shiftedDate(-56)),
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
      semester: cycleId,
    }
    const { error } = await coordinatorClient.from('studentnominations').insert(nomination)
    if (!error) return nomination
    if (error.code !== '23505') throw new Error(getDatabaseErrorMessage(error))
  }
  throw new Error('A unique testing nomination ID could not be generated.')
}

function dateOnly(date) {
  return databaseTimestamp(date).slice(0, 10)
}

// Reserved fictional range (555-0100 to 555-0199), so no real person can be reached.
function fictionalPhoneNumber() {
  return `+1555010${randomNumber(10, 99)}`
}

function createTestingPhoto(name) {
  const canvas = document.createElement('canvas')
  canvas.width = 300
  canvas.height = 400
  const context = canvas.getContext('2d')
  context.fillStyle = '#d6ecf6'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#0d80aa'
  context.font = 'bold 96px sans-serif'
  context.textAlign = 'center'
  context.fillText(name.split(' ').map((part) => part[0]).join(''), canvas.width / 2, 230)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The testing photo could not be created.'))), 'image/png')
  })
}

async function createTestingApplicationDocuments(client, bucket, application, fields) {
  const { jsPDF } = await import('jspdf')
  const paths = {}
  for (const field of fields) {
    let file
    let fileName
    if (field === 'profile_photo') {
      file = await createTestingPhoto(`${application.first_name} ${application.last_name}`)
      fileName = 'demo.png'
    } else {
      const pdf = new jsPDF()
      pdf.text(`Synthetic testing document: ${field.replace(/_/g, ' ')}`, 20, 20)
      pdf.text(`Applicant: ${application.first_name} ${application.last_name}`, 20, 35)
      pdf.text('Invented data for portal testing only.', 20, 50)
      file = pdf.output('blob')
      fileName = 'demo.pdf'
    }
    const path = `${application.student_id}/${application.application_id}/${field}/${crypto.randomUUID()}-${fileName}`
    const { error } = await client.storage.from(bucket).upload(path, file, { contentType: file.type || 'application/pdf', upsert: false })
    if (error) throw new Error(getDatabaseErrorMessage(error))
    paths[field] = path
  }
  return paths
}

async function createSubmittedInboundApplication(studentClient, studentId, email, name, cycleId, nominationId, country) {
  const [firstName, ...lastNameParts] = name.split(' ')
  const draft = {
    application_id: randomNumber(100000000, 999999999),
    first_name: firstName,
    last_name: lastNameParts.join(' '),
    gender: 'Female',
    birthdate: '2003-04-12',
    country_of_residence: country.name,
    nationality: country.id,
    passport_issuing_country: country.id,
    passport_number: `T${randomNumber(1000000, 9999999)}`,
    passport_expiry_date: dateOnly(shiftedDate(3 * 365)),
    phone_number: fictionalPhoneNumber(),
    is_whatsapp_available: true,
    major: 'Finance',
    current_year_of_study: 'Third year',
    gpa: 3.6,
    max_gpa: 4,
    credits_passed: 75,
    max_credits: 120,
    expected_graduation_date: dateOnly(shiftedDate(400)),
    email,
    semester_applied_for: cycleId,
    student_id: studentId,
    nomination_id: nominationId,
    application_status: 'Draft',
    tos: false,
  }
  const { error: insertError } = await studentClient.from('inboundapplication').insert(draft)
  if (insertError) throw new Error(getDatabaseErrorMessage(insertError))

  // The criminal-record certificate is included so unconditional approval can be tested
  // without first signing in as the student.
  const documents = await createTestingApplicationDocuments(studentClient, 'inbound-application-files', draft, [
    'passport_copy', 'transcript', 'profile_photo', 'cv', 'english_evidence', 'criminal_record_certificate',
  ])
  const { error: submitError } = await studentClient
    .from('inboundapplication')
    .update({
      application_status: 'Submitted',
      submitted_at: new Date().toISOString(),
      tos: true,
      ...documents,
      english_evidence_type: 'University letter',
    })
    .eq('application_id', draft.application_id)
  if (submitError) throw new Error(getDatabaseErrorMessage(submitError))

  const { error: contactError } = await studentClient.rpc('save_my_emergency_contact', {
    requested_name: 'Sam Smith',
    requested_phone: fictionalPhoneNumber(),
    requested_email: 'emergency-contact@example.com',
  })
  if (contactError) throw new Error(getDatabaseErrorMessage(contactError))
}

async function createSubmittedOutboundApplication(studentClient, studentId, name, cycleId, universityId, country) {
  const [firstName, ...lastNameParts] = name.split(' ')
  const draft = {
    application_id: Number(`${Date.now()}${randomNumber(100, 999)}`),
    first_name: firstName,
    last_name: lastNameParts.join(' '),
    gender: 'Male',
    birthdate: '2004-01-01',
    nationality: country.id,
    passport_issuing_country: country.id,
    passport_number: `K${randomNumber(1000000, 9999999)}`,
    passport_expiry_date: dateOnly(shiftedDate(3 * 365)),
    civil_id_number: Number(`${randomNumber(200000, 399999)}${randomNumber(100000, 999999)}`),
    civil_id_expiry: dateOnly(shiftedDate(2 * 365)),
    phone_number: fictionalPhoneNumber(),
    is_whatsapp_available: true,
    gpa: 3.5,
    expected_graduation_semester: dateOnly(shiftedDate(365)),
    credits_passed: 75,
    major: 'Business Administration',
    current_year_of_study: 'Third year',
    tos: false,
    university_id: universityId,
    semester_applied_for: cycleId,
    student_id: studentId,
    application_status: 'Draft',
  }
  const { error: insertError } = await studentClient.from('outboundapplication').insert(draft)
  if (insertError) throw new Error(getDatabaseErrorMessage(insertError))

  const documents = await createTestingApplicationDocuments(studentClient, 'outbound-application-files', draft, [
    'civil_id_copy', 'passport_copy', 'transcript', 'profile_photo', 'cv',
  ])
  const { error: submitError } = await studentClient
    .from('outboundapplication')
    .update({
      application_status: 'Submitted',
      submitted_at: new Date().toISOString(),
      tos: true,
      ...documents,
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

  const { data: countries, error: countriesError } = await supabase.from('country').select('id, name').order('name')
  if (countriesError) throw new Error(getDatabaseErrorMessage(countriesError))
  const abroad = countries.filter(({ name }) => name !== 'Kuwait')
  if (!abroad.length) throw new Error('Add countries before starting testing mode.')
  const incomingCountry = abroad[randomNumber(0, abroad.length - 1)]
  const kuCountry = countries.find(({ name }) => name === 'Kuwait') || abroad[0]

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
  const incomingWithoutApplication = created.find(({ account }) => account.role === 'incoming-no-application')
  const kuStudent = created.find(({ account }) => account.role === 'ku')
  const coordinatorClient = await signInTestAccount(coordinator.account)
  const nomination = await createTestingNomination(
    coordinatorClient,
    coordinator.profileId,
    cycle.id,
    { name: incoming.account.name, email: incoming.email },
  )
  const unusedNomination = await createTestingNomination(
    coordinatorClient,
    coordinator.profileId,
    cycle.id,
    { name: incomingWithoutApplication.account.name, email: incomingWithoutApplication.email },
  )
  incomingWithoutApplication.account.nominationId = unusedNomination.id
  await savePublicAccounts(accounts)
  await createSubmittedInboundApplication(
    await signInTestAccount(incoming.account),
    incoming.profileId,
    incoming.email,
    incoming.account.name,
    cycle.id,
    nomination.id,
    incomingCountry,
  )
  await createSubmittedOutboundApplication(
    await signInTestAccount(kuStudent.account),
    kuStudent.profileId,
    kuStudent.account.name,
    cycle.id,
    university.university_id,
    kuCountry,
  )

  const { error: analyticsError } = await supabase.rpc('seed_testing_cycle_applications', { requested_cycle_id: cycle.id })
  if (analyticsError) throw new Error(getDatabaseErrorMessage(analyticsError))

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
      setMessage('Testing accounts and KU semester data are ready, including 80 extra incoming and 80 extra outgoing applications for the KU semester graphs.')
    } catch (setupError) {
      setError(setupError.message || getDatabaseErrorMessage(setupError))
    }
    // Setup adds a KU semester, even when it stops partway.
    forgetReferenceData()
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
    // Ending the test removes its KU semesters and restores the partner universities.
    forgetReferenceData()
    setEnabled(false)
    setAccounts([])
    setMessage('Testing mode is off. Registered test data and accounts were removed, and partner universities were restored.')
    onTestingModeChanged(false)
    await loadTestingState()
    setBusyAction(null)
  }

  const fillGraphData = async () => {
    setBusyAction('graphs')
    setError('')
    setMessage('')
    try {
      const { data: registered, error: registryError } = await supabase.from('testing')
        .select('exchange_cycle_id').not('exchange_cycle_id', 'is', null)
      if (registryError) throw registryError
      const ids = (registered || []).map(({ exchange_cycle_id: cycleId }) => cycleId)
      if (!ids.length) throw new Error('Start a testing scenario before adding graph data.')
      const { data: cycle, error: cycleError } = await supabase.from('exchange_cycle').select('id')
        .in('id', ids).lte('application_o', new Date().toISOString()).order('id', { ascending: false }).limit(1).maybeSingle()
      if (cycleError) throw cycleError
      if (!cycle) throw new Error('The testing scenario needs a KU semester whose applications have opened.')
      const { error: seedError } = await supabase.rpc('seed_testing_cycle_applications', { requested_cycle_id: cycle.id })
      if (seedError) throw seedError
      setMessage('Graph demo data is ready: 80 extra incoming and 80 extra outgoing applications. Running this again does not duplicate them.')
    } catch (graphError) {
      setError(getDatabaseErrorMessage(graphError))
    }
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
        <h1 id="testing-heading">Testing mode</h1>
        <p className="testing-card__intro">
          Generated accounts can change only records created while testing mode is on.
          Turning it off removes registered test data and the generated accounts, and undoes any
          edits or deletions KU coordinators made to real partner universities.
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
                <button className="btn btn--secondary" type="button" onClick={fillGraphData} disabled={busy || accounts.length === 0}>
                  {busyAction === 'graphs' ? 'Preparing graph data...' : 'Fill KU semester graphs with demo data'}
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
                        {account.nominationId && <span>Nomination ID: {account.nominationId}</span>}
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
