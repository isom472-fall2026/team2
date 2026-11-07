import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { useAppStore } from '../stores/appStore'
import { getAcademicFieldError, majors, otherMajor } from '../studentExchangeEligibility'
import DateField from './DateField'
import { removeUploadedFiles, uploadReplacementFiles } from '../applicationFiles'
import ReplacementFileField from './ReplacementFileField'
import './OutboundApplication.css'

const DATE_TYPES = ['date', 'month', 'datetime-local']

const storageBucket = 'outbound-application-files'

const steps = [
  { path: 'personal-information', title: 'Personal information', description: 'Tell us who you are and how to contact you.' },
  { path: 'academic-information', title: 'Academic information', description: 'Share your current academic standing at KU.' },
  { path: 'exchange-documents', title: 'Exchange and documents', description: 'Choose a destination and attach the required documents.' },
  { path: 'terms-and-conditions', title: 'Terms and conditions', description: 'Review and confirm each statement before submitting.' },
]

const terms = [
  'I confirm that the information and documents in this application are accurate and complete.',
  'I authorize Kuwait University to verify the information and documents provided for this application.',
  'I understand that submitting this application does not guarantee selection or placement.',
  'I will keep confidential any personal, sensitive, or otherwise non-public information I encounter through the exchange and will not share it without authorization.',
  'If selected, I will comply with applicable laws, visa and immigration requirements, and Kuwait University and host-university rules.',
]

const emptyForm = {
  first_name: '',
  last_name: '',
  middle_name: '',
  gender: '',
  birthdate: '',
  profile_photo: '',
  passport_number: '',
  passport_expiry_date: '',
  civil_id_number: '',
  civil_id_expiry: '',
  civil_id_copy: '',
  passport_copy: '',
  gpa: '',
  expected_graduation_semester: '',
  credits_passed: '',
  phone_number: '',
  is_whatsapp_available: false,
  major: '',
  major_other: '',
  transcript: '',
  current_year_of_study: '',
  university_id: '',
  nationality: '',
  passport_issuing_country: '',
}

const personalInformationFieldNames = [
  'first_name',
  'last_name',
  'middle_name',
  'gender',
  'birthdate',
  'phone_number',
  'nationality',
  'passport_number',
  'passport_expiry_date',
  'civil_id_number',
  'civil_id_expiry',
  'passport_issuing_country',
]

function dateValue(value) {
  return value ? String(value).slice(0, 10) : ''
}

function monthValue(value) {
  return dateValue(value).slice(0, 7)
}

function optionalText(value) {
  return String(value ?? '').trim() || null
}

function uploadedFileName(path) {
  const fileName = String(path ?? '').split('/').pop() || ''
  return fileName.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '')
}

function displayDate(value) {
  if (!value) return ''
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString()
}

function displayMonth(value) {
  if (!value) return ''
  const date = new Date(`${String(value).slice(0, 7)}-01T00:00:00`)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function formFromApplication(application) {
  const storedMajor = application.major ?? ''
  const isListedMajor = majors.includes(storedMajor)
  return {
    ...emptyForm,
    ...application,
    major: isListedMajor || !storedMajor ? storedMajor : otherMajor,
    major_other: isListedMajor ? '' : storedMajor,
    birthdate: dateValue(application.birthdate),
    passport_expiry_date: dateValue(application.passport_expiry_date),
    civil_id_expiry: dateValue(application.civil_id_expiry),
    expected_graduation_semester: monthValue(application.expected_graduation_semester),
    gpa: application.gpa ?? '',
    credits_passed: application.credits_passed ?? '',
    university_id: application.university_id ?? '',
    nationality: application.nationality ?? '',
    passport_issuing_country: application.passport_issuing_country ?? '',
  }
}

function isCycleOpen(cycle) {
  const opensAt = Date.parse(cycle.application_o)
  const closesAt = Date.parse(cycle.application_c)
  const now = Date.now()
  return Number.isFinite(opensAt) && Number.isFinite(closesAt) && opensAt <= now && now <= closesAt
}

function getPersonalFieldError(field, form) {
  const value = String(form[field] ?? '').trim()
  if (['first_name', 'last_name', 'birthdate', 'gender', 'phone_number', 'nationality', 'passport_number', 'passport_expiry_date', 'civil_id_number', 'civil_id_expiry', 'passport_issuing_country'].includes(field) && !value) {
    const requiredMessages = {
      first_name: 'Enter your first name.',
      last_name: 'Enter your last name.',
      birthdate: 'Enter your date of birth.',
      gender: 'Select a gender.',
      phone_number: 'Enter your phone number.',
      nationality: 'Select your nationality.',
      passport_number: 'Enter your passport number.',
      passport_expiry_date: 'Enter your passport expiry date.',
      civil_id_number: 'Enter your Civil ID number.',
      civil_id_expiry: 'Enter your Civil ID expiry date.',
      passport_issuing_country: 'Select the passport issuing country.',
    }
    return requiredMessages[field]
  }

  const today = new Date()
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  if (field === 'birthdate' && value >= todayValue) return 'Date of birth must be in the past.'
  if (field === 'phone_number') {
    const digits = value.replace(/\D/g, '')
    if (!/^\+?[\d\s()-]+$/.test(value) || digits.length < 7 || digits.length > 15) {
      return 'Enter a phone number with 7 to 15 digits.'
    }
  }
  if (field === 'passport_expiry_date' && value < todayValue) return 'Passport must not be expired.'
  if (field === 'civil_id_number' && !/^\d{12}$/.test(value)) return 'Civil ID number must contain exactly 12 digits.'
  if (field === 'civil_id_expiry' && value < todayValue) return 'Civil ID must not be expired.'
  return ''
}

function getCreditsWarning(form) {
  const value = String(form.credits_passed ?? '').trim()
  if (!value) return ''
  const credits = Number(value)
  if (!Number.isInteger(credits) || credits < 60 || credits >= 103 || credits % 3 === 0) return ''
  return 'Please double-check that the number of credits passed is correct.'
}

function getApplicationSaveErrorMessage(error) {
  if (error?.code === '23514') {
    const knownMessages = {
      'Birthdate must be in the past': 'Date of birth must be in the past.',
      'Passport must not be expired': 'Passport must not be expired.',
      'Civil ID must not be expired': 'Civil ID must not be expired.',
      'Expected graduation date must be in the future': 'Expected graduation month must be after the 20th of this month.',
    }
    if (Object.prototype.hasOwnProperty.call(knownMessages, error.message)) {
      return knownMessages[error.message]
    }

    const constraint = error.message?.match(/check constraint "outboundapplication_(.+)_check"/i)?.[1]
    if (constraint) {
      const fieldNames = {
        civil_id_number: 'Civil ID number',
        credits_passed: 'Credits passed',
        current_year_of_study: 'Current year of study',
        gender: 'Gender',
        gpa: 'GPA',
        phone_number: 'Phone number',
      }
      const fieldName = fieldNames[constraint] || constraint.replaceAll('_', ' ')
      return `${fieldName} does not meet the allowed format or range.`
    }
  }
  return getDatabaseErrorMessage(error)
}

function InputField({ label, name, value, onChange, onBlur, error, type = 'text', required = false, ...props }) {
  const Field = DATE_TYPES.includes(type) ? DateField : 'input'
  return (
    <label className="outbound-form__field">
      <span>{label}{required && <span className="outbound-form__required" aria-hidden="true"> *</span>}</span>
      <Field
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        {...props}
      />
      {error && <span className="outbound-form__field-error" id={`${name}-error`}>{error}</span>}
    </label>
  )
}

function SelectField({ label, name, value, onChange, onBlur, error, children, required = false }) {
  return (
    <label className="outbound-form__field">
      <span>{label}{required && <span className="outbound-form__required" aria-hidden="true"> *</span>}</span>
      <select
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
      >
        {children}
      </select>
      {error && <span className="outbound-form__field-error" id={`${name}-error`}>{error}</span>}
    </label>
  )
}

function PersonalInformationPage({ form, onChange, onBlur, fieldErrors, countries }) {
  return (
    <div className="outbound-form__grid">
      <InputField label="First name" name="first_name" value={form.first_name} onChange={onChange} onBlur={onBlur} error={fieldErrors.first_name} required autoComplete="given-name" />
      <InputField label="Last name" name="last_name" value={form.last_name} onChange={onChange} onBlur={onBlur} error={fieldErrors.last_name} required autoComplete="family-name" />
      <InputField label="Middle name" name="middle_name" value={form.middle_name} onChange={onChange} onBlur={onBlur} error={fieldErrors.middle_name} autoComplete="additional-name" />
      <SelectField label="Gender" name="gender" value={form.gender} onChange={onChange} onBlur={onBlur} error={fieldErrors.gender} required>
        <option value="">Select gender</option>
        <option value="Female">Female</option>
        <option value="Male">Male</option>
      </SelectField>
      <InputField label="Date of birth" name="birthdate" value={form.birthdate} onChange={onChange} onBlur={onBlur} error={fieldErrors.birthdate} type="date" required />
      <InputField label="Phone number" name="phone_number" value={form.phone_number} onChange={onChange} onBlur={onBlur} error={fieldErrors.phone_number} type="tel" required autoComplete="tel" />
      <SelectField label="Nationality" name="nationality" value={form.nationality} onChange={onChange} onBlur={onBlur} error={fieldErrors.nationality} required>
        <option value="">Select a country</option>
        {countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
      </SelectField>
      <InputField label="Passport number" name="passport_number" value={form.passport_number} onChange={onChange} onBlur={onBlur} error={fieldErrors.passport_number} required />
      <InputField label="Passport expiry date" name="passport_expiry_date" value={form.passport_expiry_date} onChange={onChange} onBlur={onBlur} error={fieldErrors.passport_expiry_date} type="date" required />
      <InputField label="Civil ID number" name="civil_id_number" value={form.civil_id_number} onChange={onChange} onBlur={onBlur} error={fieldErrors.civil_id_number} inputMode="numeric" pattern="[0-9]{12}" required />
      <InputField label="Civil ID expiry date" name="civil_id_expiry" value={form.civil_id_expiry} onChange={onChange} onBlur={onBlur} error={fieldErrors.civil_id_expiry} type="date" required />
      <SelectField label="Passport issuing country" name="passport_issuing_country" value={form.passport_issuing_country} onChange={onChange} onBlur={onBlur} error={fieldErrors.passport_issuing_country} required>
        <option value="">Select a country</option>
        {countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
      </SelectField>
      <label className="outbound-form__checkbox outbound-form__checkbox--inline">
        <input type="checkbox" name="is_whatsapp_available" checked={form.is_whatsapp_available} onChange={onChange} />
        <span>This phone number is available on WhatsApp</span>
      </label>
    </div>
  )
}

function AcademicInformationPage({
  form,
  onChange,
  onBlur,
  fieldErrors,
  showCreditsWarning,
}) {
  return (
    <div className="outbound-form__grid">
      <SelectField label="Major" name="major" value={form.major} onChange={onChange} onBlur={onBlur} error={fieldErrors.major} required>
        <option value="">Select your major</option>
        {majors.map((major) => <option key={major} value={major}>{major}</option>)}
        <option value={otherMajor}>Other</option>
      </SelectField>
      {form.major === otherMajor && (
        <InputField
          label="Specify your major"
          name="major_other"
          value={form.major_other}
          onChange={onChange}
          onBlur={onBlur}
          error={fieldErrors.major_other}
          required
        />
      )}
      <SelectField label="Current year of study" name="current_year_of_study" value={form.current_year_of_study} onChange={onChange} onBlur={onBlur} error={fieldErrors.current_year_of_study} required>
        <option value="">Select your year</option>
        <option value="Second year">Second year</option>
        <option value="Third year">Third year</option>
        <option value="Fourth year">Fourth year</option>
      </SelectField>
      <InputField label="Current GPA" name="gpa" value={form.gpa} onChange={onChange} onBlur={onBlur} error={fieldErrors.gpa} type="number" min="3" max="4" step="any" required />
      <div className="outbound-form__field-group">
        <InputField
          label="Credits passed"
          name="credits_passed"
          value={form.credits_passed}
          onChange={onChange}
          onBlur={onBlur}
          error={fieldErrors.credits_passed}
          type="number"
          min="60"
          max="102"
          step="1"
          required
        />
        {showCreditsWarning && (
          <p className="outbound-form__field-warning" role="status">
            Please double-check that the number of credits passed is correct.
          </p>
        )}
      </div>
      <InputField label="Expected graduation month and year" name="expected_graduation_semester" value={form.expected_graduation_semester} onChange={onChange} onBlur={onBlur} error={fieldErrors.expected_graduation_semester} type="month" required />
    </div>
  )
}

const editableStatuses = ['Submitted', 'In Review', 'Pending Interview']

const academicFieldNames = (form) => [
  'major',
  ...(form.major === otherMajor ? ['major_other'] : []),
  'current_year_of_study',
  'gpa',
  'credits_passed',
  'expected_graduation_semester',
]

// Used by the KU student on their receipt and by the KU coordinator on the Manage page. Saving
// creates an edited copy and returns it; the version being edited becomes 'Modified'.
const outboundDocuments = [
  ['civil_id_copy', 'Civil ID copy'],
  ['passport_copy', 'Passport copy'],
  ['transcript', 'Academic transcript'],
  ['profile_photo', 'Personal photo'],
]

export function OutboundApplicationEditor({ application, countries, cycles, universities, onSaved, onCancel, editorLabel = 'your' }) {
  const [form, setForm] = useState(() => formFromApplication(application))
  const [files, setFiles] = useState({})
  const [fieldErrors, setFieldErrors] = useState({})
  const [state, setState] = useState({ saving: false, error: '' })

  const chooseFile = (field, file) => {
    setFiles((current) => {
      const next = { ...current }
      if (file) next[field] = file
      else delete next[field]
      return next
    })
  }

  const updateField = (event) => {
    const { name, value, checked, type } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
    setFieldErrors((current) => ({ ...current, [name]: '' }))
    setState((current) => ({ ...current, error: '' }))
  }

  // The current choice stays selectable even if its window has closed or the university was
  // withdrawn; anything else must be open now, as modify_outbound_application() checks.
  const isCurrent = (value, field) => String(value) === String(application[field])
  const selectableCycles = cycles.filter((cycle) => isCurrent(cycle.id, 'semester_applied_for') || Date.parse(cycle.application_c) >= Date.now())
  const selectableUniversities = universities.filter((university) => isCurrent(university.university_id, 'university_id') || university.available !== false)

  const validateOnBlur = (event) => {
    const { name } = event.target
    const fieldError = personalInformationFieldNames.includes(name)
      ? getPersonalFieldError(name, form)
      : getAcademicFieldError(name, form)
    setFieldErrors((current) => ({ ...current, [name]: fieldError }))
  }

  const save = async (event) => {
    event.preventDefault()
    const errors = Object.fromEntries([
      ...personalInformationFieldNames.map((field) => [field, getPersonalFieldError(field, form)]),
      ...academicFieldNames(form).map((field) => [field, getAcademicFieldError(field, form)]),
    ].filter(([, fieldError]) => fieldError))
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setState({ saving: false, error: 'Correct the highlighted fields before saving.' })
      return
    }
    if (!form.university_id || !form.semester_applied_for) {
      setState({ saving: false, error: 'Choose a partner university and a KU semester.' })
      return
    }
    setState({ saving: true, error: '' })
    let uploaded
    try {
      uploaded = await uploadReplacementFiles(storageBucket, application, files)
    } catch (uploadError) {
      setState({ saving: false, error: `File upload failed: ${getDatabaseErrorMessage(uploadError)}` })
      return
    }
    const { data, error: saveError } = await supabase.rpc('modify_outbound_application', {
      requested_application_id: Number(application.application_id),
      requested_changes: {
        first_name: form.first_name.trim(),
        middle_name: optionalText(form.middle_name),
        last_name: form.last_name.trim(),
        gender: form.gender || null,
        birthdate: form.birthdate || null,
        nationality: form.nationality ? Number(form.nationality) : null,
        passport_issuing_country: form.passport_issuing_country ? Number(form.passport_issuing_country) : null,
        passport_number: optionalText(form.passport_number),
        passport_expiry_date: form.passport_expiry_date || null,
        civil_id_number: String(form.civil_id_number ?? '').trim() ? Number(form.civil_id_number) : null,
        civil_id_expiry: form.civil_id_expiry || null,
        phone_number: optionalText(form.phone_number),
        is_whatsapp_available: Boolean(form.is_whatsapp_available),
        major: optionalText(form.major === otherMajor ? form.major_other : form.major),
        current_year_of_study: form.current_year_of_study || null,
        gpa: form.gpa === '' ? null : Number(form.gpa),
        credits_passed: form.credits_passed === '' ? null : Number(form.credits_passed),
        expected_graduation_semester: form.expected_graduation_semester ? `${form.expected_graduation_semester}-20` : null,
        university_id: form.university_id ? Number(form.university_id) : null,
        semester_applied_for: form.semester_applied_for ? Number(form.semester_applied_for) : null,
        ...uploaded,
      },
    })
    if (saveError || !data) {
      await removeUploadedFiles(storageBucket, Object.values(uploaded))
      setState({ saving: false, error: saveError ? getApplicationSaveErrorMessage(saveError) : 'The changes were not saved.' })
      return
    }
    onSaved(data)
  }

  return (
    <form className="inbound-application-editor" onSubmit={save} noValidate>
      <h2>Edit {editorLabel} application</h2>
      <p>
        Saving keeps the current version in the application history and replaces it with the edited one.
        The partner university and the KU semester cannot be changed here.
      </p>
      <h3 className="outbound-form__section-heading">Personal information</h3>
      <PersonalInformationPage form={form} onChange={updateField} onBlur={validateOnBlur} fieldErrors={fieldErrors} countries={countries} />
      <h3 className="outbound-form__section-heading">Academic information</h3>
      <AcademicInformationPage
        form={form}
        onChange={updateField}
        onBlur={validateOnBlur}
        fieldErrors={fieldErrors}
        showCreditsWarning={Boolean(getCreditsWarning(form))}
      />
      <h3 className="outbound-form__section-heading">Destination and semester</h3>
      <div className="outbound-form__grid">
        <SelectField label="KU semester" name="semester_applied_for" value={form.semester_applied_for || ''} onChange={updateField} required>
          <option value="">Select a KU semester</option>
          {selectableCycles.map((cycle) => (
            <option key={cycle.id} value={cycle.id}>{cycle.semester} {cycle.academic_year}</option>
          ))}
        </SelectField>
        <SelectField label="Preferred partner university" name="university_id" value={form.university_id} onChange={updateField} required>
          <option value="">Select a destination</option>
          {selectableUniversities.map((university) => (
            <option key={university.university_id} value={university.university_id}>{university.name}</option>
          ))}
        </SelectField>
      </div>
      <h3 className="outbound-form__section-heading">Documents</h3>
      <div className="outbound-form__grid">
        {outboundDocuments.map(([field, label]) => (
          <ReplacementFileField key={field} label={label} field={field} currentPath={application[field]} onChange={chooseFile} disabled={state.saving} />
        ))}
      </div>
      {state.error && <p className="outbound-application__error" role="alert">{state.error}</p>}
      <div className="outbound-receipt__actions">
        <button className="btn btn--primary" type="submit" disabled={state.saving}>
          {state.saving ? 'Saving changes…' : 'Save changes'}
        </button>
        <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={state.saving}>Cancel</button>
      </div>
    </form>
  )
}

function ExchangeDocumentsPage({ form, onChange, cycles, universities, onUpload, uploading }) {
  return (
    <div className="outbound-form__grid">
      <SelectField label="KU semester" name="semester_applied_for" value={form.semester_applied_for || ''} onChange={onChange} required>
        <option value="">Select an open cycle</option>
        {cycles.map((cycle) => (
          <option key={cycle.id} value={cycle.id}>{cycle.semester} {cycle.academic_year}</option>
        ))}
      </SelectField>
      <SelectField label="Partner university" name="university_id" value={form.university_id} onChange={onChange} required>
        <option value="">Select a destination</option>
        {universities.map((university) => <option key={university.university_id} value={university.university_id}>{university.name}</option>)}
      </SelectField>
      <p className="outbound-form__university-note outbound-form__field-warning">
        Your selected partner university is a preference only and is not guaranteed. You will be notified of available choices that are confirmed to be available.
      </p>
      <div className="outbound-form__upload">
        <label className="outbound-form__field">
          <span>Civil ID copy <span className="outbound-form__required" aria-hidden="true">*</span></span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(event) => onUpload('civil_id_copy', event)}
            disabled={uploading.civil_id_copy}
            required={!form.civil_id_copy}
          />
        </label>
        {uploading.civil_id_copy && <p role="status">Uploading Civil ID copy…</p>}
        {form.civil_id_copy && <p className="outbound-form__upload-success" role="status">{uploadedFileName(form.civil_id_copy)} uploaded successfully.</p>}
      </div>
      <div className="outbound-form__upload">
        <label className="outbound-form__field">
          <span>Passport copy <span className="outbound-form__required" aria-hidden="true">*</span></span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(event) => onUpload('passport_copy', event)}
            disabled={uploading.passport_copy}
            required={!form.passport_copy}
          />
        </label>
        {uploading.passport_copy && <p role="status">Uploading passport copy…</p>}
        {form.passport_copy && <p className="outbound-form__upload-success" role="status">{uploadedFileName(form.passport_copy)} uploaded successfully.</p>}
      </div>
      <div className="outbound-form__upload">
        <label className="outbound-form__field">
          <span>Academic transcript <span className="outbound-form__required" aria-hidden="true">*</span></span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(event) => onUpload('transcript', event)}
            disabled={uploading.transcript}
            required={!form.transcript}
          />
        </label>
        {uploading.transcript && <p role="status">Uploading transcript…</p>}
        {form.transcript && <p className="outbound-form__upload-success" role="status">{uploadedFileName(form.transcript)} uploaded successfully.</p>}
      </div>
      <div className="outbound-form__upload">
        <label className="outbound-form__field">
          <span>Personal photo (optional)</span>
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(event) => onUpload('profile_photo', event)}
            disabled={uploading.profile_photo}
          />
        </label>
        {uploading.profile_photo && <p role="status">Uploading personal photo…</p>}
        {form.profile_photo && <p className="outbound-form__upload-success" role="status">{uploadedFileName(form.profile_photo)} uploaded successfully.</p>}
      </div>
    </div>
  )
}

function TermsPage({ accepted, onChange }) {
  return (
    <fieldset className="outbound-terms">
      <legend>Terms and conditions</legend>
      <p>Select every statement to activate the final submission button.</p>
      {terms.map((term, index) => (
        <label key={term} className="outbound-form__checkbox">
          <input type="checkbox" checked={accepted[index]} onChange={() => onChange(index)} />
          <span>{term}</span>
        </label>
      ))}
    </fieldset>
  )
}

function ApplicationReceipt({ application, studentId, countries, cycles, universities, onDownload, onBack, onEdit, onRequestWithdrawal, withdrawalState, withdrawalReason, isConfirmingWithdrawal, onWithdrawalReasonChange, onCancelWithdrawal }) {
  const [uploadedPages, setUploadedPages] = useState([])
  const [imageError, setImageError] = useState('')
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [viewingImage, setViewingImage] = useState(null)
  const receiptRef = useRef(null)
  const statusClass = String(application.application_status || 'Unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  // Drafts left open at the deadline are rejected automatically and never get a submission
  // time; a coordinator's rejection comes after the student submitted.
  const missedDeadline = application.application_status === 'Rejected' && !application.submitted_at
  const countryName = (id) => countries.find((country) => Number(country.id) === Number(id))?.name || ''
  const cycleName = cycles.find((cycle) => Number(cycle.id) === Number(application.semester_applied_for))
  const universityName = universities.find((university) => Number(university.university_id) === Number(application.university_id))?.name
  const details = [
    ['Student ID', studentId],
    ['First name', application.first_name],
    ['Last name', application.last_name],
    ['Middle name', application.middle_name],
    ['Gender', application.gender],
    ['Date of birth', displayDate(application.birthdate)],
    ['Phone number', application.phone_number],
    ['WhatsApp available', application.is_whatsapp_available ? 'Yes' : 'No'],
    ['Nationality', countryName(application.nationality)],
    ['Passport number', application.passport_number],
    ['Passport expiry date', displayDate(application.passport_expiry_date)],
    ['Civil ID number', application.civil_id_number],
    ['Civil ID expiry date', displayDate(application.civil_id_expiry)],
    ['Civil ID copy', uploadedFileName(application.civil_id_copy)],
    ['Passport issuing country', countryName(application.passport_issuing_country)],
    ['Major', application.major],
    ['Current year of study', application.current_year_of_study],
    ['GPA', application.gpa],
    ['Credits passed', application.credits_passed],
    ['Expected graduation', displayMonth(application.expected_graduation_semester)],
    ['KU semester', cycleName ? `${cycleName.semester} ${cycleName.academic_year}` : application.semester_applied_for],
    ['Preferred partner university', universityName || application.university_id],
    ['Passport copy', uploadedFileName(application.passport_copy)],
    ['Academic transcript', uploadedFileName(application.transcript)],
    ['Personal photo', uploadedFileName(application.profile_photo)],
    ['Terms and conditions accepted', application.tos ? 'Yes' : 'No'],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '')

  useEffect(() => {
    let current = true

    async function loadUploadedDocuments() {
      setUploadedPages([])
      setImageError('')
      setDocumentsLoading(true)
      const files = [
        ['Civil ID copy', application.civil_id_copy],
        ['Passport copy', application.passport_copy],
        ['Academic transcript', application.transcript],
        ['Personal photo', application.profile_photo],
      ].filter(([, path]) => Boolean(path))
      const results = await Promise.all(files.map(async ([label, path]) => {
        const storage = supabase.storage.from(storageBucket)
        const fileName = uploadedFileName(path)
        const [viewResult, downloadResult] = await Promise.all([
          storage.createSignedUrl(path, 3600),
          storage.createSignedUrl(path, 3600, { download: fileName }),
        ])
        if (viewResult.error) throw viewResult.error
        if (downloadResult.error) throw downloadResult.error

        if (/\.pdf$/i.test(fileName)) {
          const { data: fileData, error: fileError } = await storage.download(path)
          if (fileError) throw fileError
          const pdfjsLib = await import('pdfjs-dist')
          pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker
          const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(await fileData.arrayBuffer()),
          })
          try {
            const pdf = await loadingTask.promise
            const pdfPages = []
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
              const page = await pdf.getPage(pageNumber)
              const originalViewport = page.getViewport({ scale: 1 })
              const viewport = page.getViewport({ scale: Math.min(2, 1400 / originalViewport.width) })
              const canvas = document.createElement('canvas')
              canvas.width = Math.ceil(viewport.width)
              canvas.height = Math.ceil(viewport.height)
              const context = canvas.getContext('2d')
              if (!context) throw new Error('A canvas context could not be created to display a PDF page.')
              await page.render({ canvas, canvasContext: context, viewport }).promise
              pdfPages.push({
                key: `${path}-${pageNumber}`,
                label,
                fileName,
                previewUrl: canvas.toDataURL('image/png'),
                downloadUrl: downloadResult.data.signedUrl,
                pageNumber,
                pageCount: pdf.numPages,
              })
              page.cleanup()
            }
            return pdfPages
          } finally {
            await loadingTask.destroy()
          }
        }

        return [{
          key: path,
          label,
          fileName,
          previewUrl: viewResult.data.signedUrl,
          downloadUrl: downloadResult.data.signedUrl,
          pageNumber: null,
          pageCount: null,
        }]
      }))
      if (current) {
        setUploadedPages(results.flat())
        setDocumentsLoading(false)
      }
    }

    loadUploadedDocuments().catch((loadError) => {
      if (current) {
        setImageError(`Uploaded documents could not be loaded: ${getDatabaseErrorMessage(loadError)}`)
        setDocumentsLoading(false)
      }
    })
    return () => { current = false }
  }, [application.application_id, application.civil_id_copy, application.passport_copy, application.transcript, application.profile_photo])

  useEffect(() => {
    if (!viewingImage) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setViewingImage(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [viewingImage])

  const handleDownload = () => {
    if (!receiptRef.current) return
    onDownload()
  }

  return (
    <section ref={receiptRef} className="outbound-receipt" aria-labelledby="outbound-receipt-heading">
      <header className="outbound-receipt__brand">
        <img src={`${import.meta.env.BASE_URL}images/kulogolightmode.png`} alt="Kuwait University" />
        <img src={`${import.meta.env.BASE_URL}images/exchangelogoeng.png`} alt="Kuwait University Exchange Program" />
      </header>
      <span className="auth-card__eyebrow">{missedDeadline ? 'Application not submitted' : 'Application submitted'}</span>
      <h1 id="outbound-receipt-heading">
        {missedDeadline ? 'Your application was not submitted'
          : application.application_status === 'Accepted' ? 'Your application was accepted'
            : application.application_status === 'Rejected' ? 'Your application was not accepted'
              : 'Your application was submitted successfully'}
      </h1>
      <p>{missedDeadline ? 'This application was not submitted before the deadline.' : 'Keep this summary for your records.'}</p>
      <dl className="outbound-receipt__metadata">
        <div><dt>Application ID</dt><dd>{application.application_id}</dd></div>
        <div><dt>Submission date</dt><dd>{new Date(application.submitted_at || application.created_at).toLocaleString()}</dd></div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className={`outbound-receipt__status outbound-receipt__status--${statusClass}`}>
              {application.application_status}
            </span>
          </dd>
        </div>
      </dl>
      <h2>Application summary</h2>
      <dl className="outbound-receipt__details">
        {details.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>
        ))}
      </dl>
      {uploadedPages.length > 0 && (
        <section className="outbound-receipt__images" aria-labelledby="outbound-receipt-images-heading">
          <h2 id="outbound-receipt-images-heading">Uploaded documents and images</h2>
          <div className="outbound-receipt__image-grid">
            {uploadedPages.map((page) => (
              <figure key={page.key}>
                <img src={page.previewUrl} alt={`${page.label}${page.pageNumber ? `, page ${page.pageNumber}` : ''}`} />
                <figcaption>{page.label}{page.pageNumber ? ` — page ${page.pageNumber} of ${page.pageCount}` : ''}</figcaption>
                <p className="outbound-receipt__image-filename">{page.fileName}</p>
                <div className="outbound-receipt__image-actions">
                  <button className="btn btn--secondary" type="button" onClick={() => setViewingImage(page)}>
                    View
                  </button>
                  <a className="btn btn--secondary" href={page.downloadUrl}>
                    Download
                  </a>
                </div>
              </figure>
            ))}
          </div>
        </section>
      )}
      {imageError && <p className="outbound-application__error" role="alert">{imageError}</p>}
      {documentsLoading && <p role="status">Preparing uploaded documents…</p>}
      {withdrawalState.error && <p className="outbound-application__error" role="alert">{withdrawalState.error}</p>}
      {withdrawalState.message && <p className="outbound-application__message" role="status">{withdrawalState.message}</p>}
      {viewingImage && (
        <div className="outbound-receipt__viewer-backdrop" onClick={() => setViewingImage(null)}>
          <section
            className="outbound-receipt__viewer"
            role="dialog"
            aria-modal="true"
            aria-label={`View ${viewingImage.label}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button className="outbound-receipt__viewer-close" type="button" onClick={() => setViewingImage(null)}>
              Close
            </button>
            <img src={viewingImage.previewUrl} alt={viewingImage.label} />
            <p>{viewingImage.label}{viewingImage.pageNumber ? ` — page ${viewingImage.pageNumber} of ${viewingImage.pageCount}` : ''}: {viewingImage.fileName}</p>
          </section>
        </div>
      )}
      <div className="outbound-receipt__actions">
        {editableStatuses.includes(application.application_status) && !isConfirmingWithdrawal && (
          <button className="btn btn--secondary" type="button" onClick={onEdit}>Edit application</button>
        )}
        {['Submitted', 'Pending Interview'].includes(application.application_status) && (
          <div className="outbound-receipt__withdrawal">
            {!isConfirmingWithdrawal ? (
              <button className="btn btn--danger" type="button" onClick={onRequestWithdrawal} disabled={withdrawalState.loading}>
                Request withdrawal
              </button>
            ) : (
              <>
                <label className="outbound-receipt__withdrawal-label" htmlFor="withdrawal-reason">
                  Reason for withdrawal <span>(optional)</span>
                </label>
                <textarea
                  id="withdrawal-reason"
                  value={withdrawalReason}
                  onChange={onWithdrawalReasonChange}
                  placeholder="Share a short reason for your request..."
                  rows="3"
                />
                <div className="outbound-receipt__withdrawal-actions">
                  <button className="btn btn--danger" type="button" onClick={onRequestWithdrawal} disabled={withdrawalState.loading}>
                    {withdrawalState.loading ? 'Requesting withdrawal...' : 'Confirm withdrawal'}
                  </button>
                  <button className="btn btn--secondary" type="button" onClick={onCancelWithdrawal} disabled={withdrawalState.loading}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <button className="btn btn--primary" type="button" onClick={handleDownload} disabled={documentsLoading || Boolean(imageError)}>
          Download PDF
        </button>
        <button className="btn btn--secondary" type="button" onClick={onBack}>Back to applications</button>
      </div>
    </section>
  )
}

function OutboundApplication() {
  const user = useAppStore((state) => state.session?.user)
  const location = useLocation()
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [cycles, setCycles] = useState([])
  const [universities, setUniversities] = useState([])
  const [countries, setCountries] = useState([])
  const [applications, setApplications] = useState([])
  const [submittedApplication, setSubmittedApplication] = useState(null)
  const [receiptError, setReceiptError] = useState('')
  const [withdrawalState, setWithdrawalState] = useState({ loading: false, error: '', message: '' })
  const [withdrawalReason, setWithdrawalReason] = useState('')
  const [isConfirmingWithdrawal, setIsConfirmingWithdrawal] = useState(false)
  const [editingApplicationId, setEditingApplicationId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [editedPersonalFields, setEditedPersonalFields] = useState({})
  const [personalFieldErrors, setPersonalFieldErrors] = useState({})
  const [editedAcademicFields, setEditedAcademicFields] = useState({})
  const [academicFieldErrors, setAcademicFieldErrors] = useState({})
  const [applicationId, setApplicationId] = useState(null)
  const [step, setStep] = useState(0)
  const [acceptedTerms, setAcceptedTerms] = useState(terms.map(() => false))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [draftSaveStatus, setDraftSaveStatus] = useState('')
  const [uploading, setUploading] = useState({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [scrollProgress, setScrollProgress] = useState(0)
  const pageContentRef = useRef(null)
  const wizardScrollRef = useRef(null)
  const lastSavedFormRef = useRef(JSON.stringify(emptyForm))
  const lastAutosaveAttemptedFormRef = useRef('')

  const openCycles = useMemo(() => cycles.filter(isCycleOpen), [cycles])
  const canSubmit = acceptedTerms.every(Boolean)
  const wizardSegments = location.pathname.split('/portal/outbound-application/')[1]?.split('/').filter(Boolean) || []
  const routeStep = steps.findIndex(({ path }) => path === wizardSegments[wizardSegments.length - 1])
  const routeApplicationId = routeStep >= 0 && wizardSegments[0] !== 'new' ? wizardSegments[0] : null
  const submittedRouteId = wizardSegments.length === 2 && wizardSegments[1] === 'submitted'
    ? wizardSegments[0]
    : null
  const activeStep = routeStep >= 0 ? routeStep : step

  const requestWithdrawal = async () => {
    if (!submittedApplication || !['Submitted', 'Pending Interview'].includes(submittedApplication.application_status)) return
    if (!isConfirmingWithdrawal) {
      setIsConfirmingWithdrawal(true)
      return
    }
    setWithdrawalState({ loading: true, error: '', message: '' })
    const { data, error: withdrawalError } = await supabase.rpc('request_outbound_withdrawal', {
      requested_application_id: Number(submittedApplication.application_id),
      requested_reason: withdrawalReason,
    })
    if (withdrawalError || !data) {
      setWithdrawalState({ loading: false, error: getDatabaseErrorMessage(withdrawalError), message: '' })
      return
    }
    setSubmittedApplication(data)
    setApplications((current) => current.map((item) => item.application_id === data.application_id
      ? { ...item, application_status: data.application_status }
      : item))
    setIsConfirmingWithdrawal(false)
    setWithdrawalState({ loading: false, error: '', message: 'Withdrawal requested. The coordinator will review it.' })
  }

  useEffect(() => {
    const pageContent = pageContentRef.current
    const wizardScroller = wizardScrollRef.current
    if (!pageContent || !wizardScroller) return undefined

    let animationFrame = 0
    setScrollProgress(0)
    pageContent.scrollTop = 0
    wizardScroller.scrollTop = 0
    const updateProgress = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        const fieldScrollDistance = Math.max(0, pageContent.scrollHeight - pageContent.clientHeight)
        const pageScrollDistance = Math.max(0, wizardScroller.scrollHeight - wizardScroller.clientHeight)
        const windowScrollDistance = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
        const totalScrollDistance = fieldScrollDistance + pageScrollDistance + windowScrollDistance
        if (totalScrollDistance === 0) {
          setScrollProgress(100)
          return
        }

        const progress = ((pageContent.scrollTop + wizardScroller.scrollTop + window.scrollY) / totalScrollDistance) * 100
        setScrollProgress(Math.max(0, Math.min(100, progress)))
      })
    }

    updateProgress()
    window.addEventListener('resize', updateProgress)
    window.addEventListener('scroll', updateProgress, { passive: true })
    wizardScroller.addEventListener('scroll', updateProgress, { passive: true })
    pageContent.addEventListener('scroll', updateProgress, { passive: true })
    const resizeObserver = new ResizeObserver(updateProgress)
    resizeObserver.observe(pageContent)
    resizeObserver.observe(wizardScroller)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', updateProgress)
      window.removeEventListener('scroll', updateProgress)
      wizardScroller.removeEventListener('scroll', updateProgress)
      pageContent.removeEventListener('scroll', updateProgress)
      resizeObserver.disconnect()
    }
  }, [activeStep, loading, location.pathname, routeApplicationId])

  const loadApplications = useCallback(async (studentId) => {
    const { data, error: applicationsError } = await supabase
      .from('outboundapplication')
      .select('application_id, application_status, semester_applied_for, university_id, created_at')
      .eq('student_id', studentId)
      .neq('application_status', 'Modified')
      .order('created_at', { ascending: false })
    if (applicationsError) throw applicationsError
    setApplications(data || [])
  }, [])

  useEffect(() => {
    let current = true

    async function loadPortalData() {
      setLoading(true)
      setError('')
      const email = user.email?.trim().toLowerCase()
      if (!email?.endsWith('@ku.edu.kw') || !user.email_confirmed_at) {
        setError('Sign in with a verified Kuwait University student account to access this application.')
        setLoading(false)
        return
      }

      const { data: studentRecord, error: studentError } = await supabase
        .from('kustudentauth')
        .select('student_id, student_email, name')
        .eq('user_id', user.id)
        .maybeSingle()

      if (studentError) {
        if (current) setError(getDatabaseErrorMessage(studentError))
        if (current) setLoading(false)
        return
      }
      if (!studentRecord || studentRecord.student_email?.trim().toLowerCase() !== email) {
        if (current) setError('Your account is not linked to a verified Kuwait University student profile.')
        if (current) setLoading(false)
        return
      }

      const [cycleResult, universityResult, countryResult] = await Promise.all([
        supabase.from('exchange_cycle').select('id, semester, academic_year, application_o, application_c').order('id', { ascending: false }),
        supabase.from('partneruniversity').select('university_id, name').eq('available', true).order('name'),
        supabase.from('country').select('id, name').order('name'),
      ])

      const catalogError = cycleResult.error || universityResult.error || countryResult.error
      if (catalogError) {
        if (current) setError(getDatabaseErrorMessage(catalogError))
        if (current) setLoading(false)
        return
      }

      try {
        const { data: ownApplications, error: applicationsError } = await supabase
          .from('outboundapplication')
          .select('application_id, application_status, semester_applied_for, university_id, created_at')
          .eq('student_id', studentRecord.student_id)
          .order('created_at', { ascending: false })
        if (applicationsError) throw applicationsError
        if (current) {
          setStudent(studentRecord)
          setCycles(cycleResult.data || [])
          setUniversities(universityResult.data || [])
          setCountries(countryResult.data || [])
          setApplications(ownApplications || [])
        }
      } catch (loadError) {
        if (current) setError(getDatabaseErrorMessage(loadError))
      } finally {
        if (current) setLoading(false)
      }
    }

    loadPortalData()
    return () => { current = false }
  }, [user.email, user.email_confirmed_at, user.id])

  useEffect(() => {
    if (!student || !routeApplicationId || routeApplicationId === String(applicationId)) return
    let current = true

    async function loadDraftFromRoute() {
      setLoading(true)
      setError('')
      const { data, error: applicationError } = await supabase
        .from('outboundapplication')
        .select('*')
        .eq('application_id', routeApplicationId)
        .eq('student_id', student.student_id)
        .single()
      if (!current) return
      if (applicationError) {
        setError(getDatabaseErrorMessage(applicationError))
        setLoading(false)
        return
      }
      if (data.application_status !== 'Draft') {
        setError('Only draft applications can be continued.')
        setLoading(false)
        navigate('/portal/outbound-application', { replace: true })
        return
      }
      const loadedForm = formFromApplication(data)
      setForm(loadedForm)
      lastSavedFormRef.current = JSON.stringify(loadedForm)
      lastAutosaveAttemptedFormRef.current = ''
      setDraftSaveStatus('')
      setEditedPersonalFields({})
      setPersonalFieldErrors({})
      setEditedAcademicFields({})
      setAcademicFieldErrors({})
      setApplicationId(data.application_id)
      setAcceptedTerms(terms.map(() => false))
      setLoading(false)
    }

    loadDraftFromRoute()
    return () => { current = false }
  }, [applicationId, navigate, routeApplicationId, student])

  useEffect(() => {
    if (!student || !routeApplicationId) return undefined
    let current = true
    const checkDraftStatus = async () => {
      const { data, error: statusError } = await supabase
        .from('outboundapplication')
        .select('application_status')
        .eq('application_id', routeApplicationId)
        .eq('student_id', student.student_id)
        .maybeSingle()
      if (!current || statusError || !data || data.application_status === 'Draft') return

      setApplications((items) => items.map((item) => (
        String(item.application_id) === String(routeApplicationId)
          ? { ...item, application_status: data.application_status }
          : item
      )))
      navigate(`/portal/outbound-application/${routeApplicationId}/submitted`, { replace: true })
    }
    checkDraftStatus()
    const intervalId = window.setInterval(checkDraftStatus, 15000)
    return () => {
      current = false
      window.clearInterval(intervalId)
    }
  }, [navigate, routeApplicationId, student])

  useEffect(() => {
    let current = true
    if (!submittedRouteId) {
      setSubmittedApplication(null)
      setReceiptError('')
      return () => { current = false }
    }
    if (!student) return () => { current = false }

    async function loadSubmittedApplication() {
      setLoading(true)
      setSubmittedApplication(null)
      setReceiptError('')
      const { data, error: applicationError } = await supabase
        .from('outboundapplication')
        .select('*')
        .eq('application_id', submittedRouteId)
        .eq('student_id', student.student_id)
        .maybeSingle()
      if (!current) return
      if (applicationError) {
        setReceiptError(getDatabaseErrorMessage(applicationError))
      } else if (!data || data.application_status === 'Draft') {
        setReceiptError('Not allowed to view this application.')
      } else if (data.application_status === 'Modified') {
        setReceiptError('This version was replaced by your edited application. Open it from your applications list.')
      } else {
        setSubmittedApplication(data)
      }
      setLoading(false)
    }

    loadSubmittedApplication()
    return () => { current = false }
  }, [student, submittedRouteId])

  const resetWizard = () => {
    setForm(emptyForm)
    setEditedPersonalFields({})
    setPersonalFieldErrors({})
    setEditedAcademicFields({})
    setAcademicFieldErrors({})
    setApplicationId(null)
    setStep(0)
    setAcceptedTerms(terms.map(() => false))
    setError('')
    setMessage('')
    navigate('/portal/outbound-application')
  }

  const updateField = (event) => {
    const { name, value, checked, type } = event.target
    const updatedValue = type === 'checkbox' ? checked : value
    setForm((current) => ({ ...current, [name]: updatedValue }))
    setDraftSaveStatus('pending')
    if (personalInformationFieldNames.includes(name) && updatedValue !== '') {
      setEditedPersonalFields((current) => ({ ...current, [name]: true }))
    }
    if (['major', 'major_other', 'current_year_of_study', 'gpa', 'credits_passed', 'expected_graduation_semester'].includes(name) && updatedValue !== '') {
      setEditedAcademicFields((current) => ({ ...current, [name]: true }))
    }
    setError('')
    setMessage('')
  }

  const validatePersonalFieldOnBlur = (event) => {
    const { name } = event.target
    if (!editedPersonalFields[name]) return
    const fieldError = getPersonalFieldError(name, form)
    setPersonalFieldErrors((current) => ({ ...current, [name]: fieldError }))
  }

  const validateAcademicFieldOnBlur = (event) => {
    const { name } = event.target
    if (!editedAcademicFields[name]) return
    const fieldError = getAcademicFieldError(name, form)
    setAcademicFieldErrors((current) => ({ ...current, [name]: fieldError }))
  }

  const validateStep = (stepToValidate) => {
    if (stepToValidate === 0) {
      return personalInformationFieldNames
        .map((field) => getPersonalFieldError(field, form))
        .find(Boolean) || ''
    }
    if (stepToValidate === 1) {
      const academicFields = [
        'major',
        ...(form.major === otherMajor ? ['major_other'] : []),
        'current_year_of_study',
        'gpa',
        'credits_passed',
        'expected_graduation_semester',
      ]
      const academicError = academicFields.map((field) => getAcademicFieldError(field, form)).find(Boolean)
      if (academicError) return academicError
    }
    if (stepToValidate === 2) {
      if (!form.university_id || !form.semester_applied_for) return 'Choose a partner university and an open KU semester.'
      if (!form.civil_id_copy || !form.passport_copy || !form.transcript) {
        return 'Upload your Civil ID copy, passport copy, and academic transcript.'
      }
    }
    return ''
  }

  const applicationValues = useCallback((tos = false) => ({
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    middle_name: optionalText(form.middle_name),
    gender: form.gender || null,
    birthdate: form.birthdate || null,
    profile_photo: form.profile_photo || null,
    passport_number: optionalText(form.passport_number),
    passport_expiry_date: form.passport_expiry_date || null,
    civil_id_number: String(form.civil_id_number ?? '').trim() ? Number(form.civil_id_number) : null,
    civil_id_expiry: form.civil_id_expiry || null,
    civil_id_copy: form.civil_id_copy || null,
    passport_copy: form.passport_copy || null,
    gpa: form.gpa === null || form.gpa === undefined || form.gpa === '' ? null : Number(form.gpa),
    expected_graduation_semester: form.expected_graduation_semester
      ? `${form.expected_graduation_semester}-20`
      : null,
    credits_passed: form.credits_passed === null || form.credits_passed === undefined || form.credits_passed === ''
      ? null
      : Number(form.credits_passed),
    phone_number: optionalText(form.phone_number),
    is_whatsapp_available: form.is_whatsapp_available,
    major: optionalText(form.major === otherMajor ? form.major_other : form.major),
    transcript: form.transcript || null,
    current_year_of_study: form.current_year_of_study || null,
    tos,
    university_id: form.university_id ? Number(form.university_id) : null,
    nationality: form.nationality ? Number(form.nationality) : null,
    passport_issuing_country: form.passport_issuing_country ? Number(form.passport_issuing_country) : null,
    semester_applied_for: Number(form.semester_applied_for),
    student_id: String(student.student_id),
    submitted_at: tos ? new Date().toISOString() : null,
  }), [form, student])

  const saveApplication = useCallback(async ({ tos = false, status = 'Draft' } = {}) => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First and last name are required to save a draft.')
      if (status === 'Draft') setDraftSaveStatus('error')
      return false
    }
    if (!form.semester_applied_for) {
      setError('Select a KU semester before saving this application.')
      if (status === 'Draft') setDraftSaveStatus('error')
      return false
    }

    const formSignature = JSON.stringify(form)
    setSaving(true)
    if (status === 'Draft') setDraftSaveStatus('saving')
    setError('')
    setMessage('')

    const payload = { ...applicationValues(tos), application_status: status }
    let savedApplicationId = applicationId
    if (applicationId !== null) {
      const { data, error: updateError } = await supabase
        .from('outboundapplication')
        .update(payload)
        .eq('application_id', applicationId)
        .eq('student_id', student.student_id)
        .select('application_id')
        .maybeSingle()
      if (updateError || !data) {
        setError(updateError ? getApplicationSaveErrorMessage(updateError) : 'The application was not saved. Check your access and try again.')
        setSaving(false)
        if (status === 'Draft') setDraftSaveStatus('error')
        return false
      }
      setApplications((current) => current.map((application) => (
        application.application_id === applicationId
          ? { ...application, application_status: status, semester_applied_for: payload.semester_applied_for, university_id: payload.university_id }
          : application
      )))
    } else {
      const { data: duplicate, error: duplicateError } = await supabase
        .from('outboundapplication')
        .select('application_id, application_status')
        .eq('student_id', student.student_id)
        .eq('semester_applied_for', payload.semester_applied_for)
        .not('application_status', 'in', '("Rejected","Modified")')
        .maybeSingle()
      if (duplicateError) {
        setError(getDatabaseErrorMessage(duplicateError))
        setSaving(false)
        if (status === 'Draft') setDraftSaveStatus('error')
        return false
      }
      if (duplicate) {
        setError(duplicate.application_status === 'Draft'
          ? 'You already have an application for this cycle. Open it from your applications list to continue.'
          : 'You have already submitted an application for this cycle.')
        await loadApplications(student.student_id).catch((loadError) => setError(getDatabaseErrorMessage(loadError)))
        setSaving(false)
        if (status === 'Draft') setDraftSaveStatus('error')
        return false
      }
      const randomId = new Uint32Array(2)
      crypto.getRandomValues(randomId)
      const randomValue = (BigInt(randomId[0]) << 32n) | BigInt(randomId[1])
      payload.application_id = 1_000_000_000_000_000 + Number(randomValue % 8_000_000_000_000_000n)
      const { data, error: insertError } = await supabase
        .from('outboundapplication')
        .insert(payload)
        .select('application_id')
        .single()
      if (insertError || !data) {
        setError(insertError
          ? getApplicationSaveErrorMessage(insertError)
          : 'The application could not be created.')
        setSaving(false)
        if (status === 'Draft') setDraftSaveStatus('error')
        return false
      }
      setApplicationId(data.application_id)
      savedApplicationId = data.application_id
      setApplications((current) => [{
        application_id: data.application_id,
        application_status: status,
        semester_applied_for: payload.semester_applied_for,
        university_id: payload.university_id,
        created_at: new Date().toISOString(),
      }, ...current])
    }
    lastSavedFormRef.current = formSignature
    lastAutosaveAttemptedFormRef.current = formSignature
    setSaving(false)
    if (status === 'Draft') setDraftSaveStatus('saved')
    return savedApplicationId
  }, [applicationId, applicationValues, form, loadApplications, student])

  useEffect(() => {
    if (!student || routeStep < 0 || loading || saving || Object.values(uploading).some(Boolean)) return undefined

    const formSignature = JSON.stringify(form)
    if (
      formSignature === lastSavedFormRef.current
      || formSignature === lastAutosaveAttemptedFormRef.current
    ) return undefined

    const autosaveTimer = window.setTimeout(async () => {
      if (!form.first_name.trim() || !form.last_name.trim() || !form.semester_applied_for) return
      lastAutosaveAttemptedFormRef.current = formSignature
      const savedApplicationId = await saveApplication()
      if (savedApplicationId && !applicationId) {
        navigate(`/portal/outbound-application/${savedApplicationId}/${steps[routeStep].path}`, { replace: true })
      }
    }, 700)

    return () => window.clearTimeout(autosaveTimer)
  }, [applicationId, form, loading, navigate, routeStep, saveApplication, saving, student, uploading])

  const startNewApplication = () => {
    if (!form.semester_applied_for) {
      setError('Select an open KU semester to start an application.')
      return
    }
    // A rejected application does not use up the cycle, so the student may apply again.
    const cycleAlreadyUsed = applications.some((application) => (
      Number(application.semester_applied_for) === Number(form.semester_applied_for)
      && application.application_status !== 'Rejected'
    ))
    if (cycleAlreadyUsed) {
      setError('An application already exists for this cycle. Open it from your applications list.')
      return
    }
    setForm({ ...emptyForm, semester_applied_for: form.semester_applied_for })
    lastSavedFormRef.current = JSON.stringify({ ...emptyForm, semester_applied_for: form.semester_applied_for })
    lastAutosaveAttemptedFormRef.current = ''
    setDraftSaveStatus('')
    setEditedPersonalFields({})
    setPersonalFieldErrors({})
    setEditedAcademicFields({})
    setAcademicFieldErrors({})
    setApplicationId(null)
    setStep(0)
    setAcceptedTerms(terms.map(() => false))
    setError('')
    setMessage('')
    navigate(`/portal/outbound-application/new/${steps[0].path}`)
  }

  const openApplication = async (id) => {
    setLoading(true)
    setError('')
    const { data, error: applicationError } = await supabase
      .from('outboundapplication')
      .select('*')
      .eq('application_id', id)
      .eq('student_id', student.student_id)
      .single()
    if (applicationError) {
      setError(getDatabaseErrorMessage(applicationError))
      setLoading(false)
      return
    }
    if (data.application_status !== 'Draft') {
      setError('Only draft applications can be continued.')
      setLoading(false)
      return
    }
    const loadedForm = formFromApplication(data)
    setForm(loadedForm)
    lastSavedFormRef.current = JSON.stringify(loadedForm)
    lastAutosaveAttemptedFormRef.current = ''
    setDraftSaveStatus('')
    setEditedPersonalFields({})
    setPersonalFieldErrors({})
    setEditedAcademicFields({})
    setAcademicFieldErrors({})
    setApplicationId(data.application_id)
    setStep(0)
    setAcceptedTerms(terms.map(() => false))
    setLoading(false)
    navigate(`/portal/outbound-application/${data.application_id}/${steps[0].path}`)
  }

  const handleSaveDraft = async () => {
    if (await saveApplication()) {
      setMessage('Draft saved. You can return to it from your applications list.')
      navigate('/portal/outbound-application')
    }
  }

  const handleNext = async (event) => {
    event.preventDefault()
    const validationError = validateStep(activeStep)
    if (validationError) {
      setError(validationError)
      return
    }
    const savedApplicationId = await saveApplication()
    if (!savedApplicationId) return
    const nextStep = Math.min(activeStep + 1, steps.length - 1)
    setStep(nextStep)
    navigate(`/portal/outbound-application/${savedApplicationId}/${steps[nextStep].path}`)
    setError('')
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    const validationError = validateStep(0) || validateStep(1) || validateStep(2)
    if (validationError) {
      setError(validationError)
      return
    }
    const savedApplicationId = await saveApplication({ tos: true, status: 'Submitted' })
    if (!savedApplicationId) return
    setApplicationId(null)
    navigate(`/portal/outbound-application/${savedApplicationId}/submitted`)
  }

  const uploadFile = async (field, event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!applicationId) {
      setError('Save this draft before uploading documents.')
      return
    }
    const allowedTypes = field === 'profile_photo'
      ? ['image/jpeg', 'image/png']
      : ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowedTypes.includes(file.type)) {
      setError('Choose a PDF, JPEG, or PNG file. Personal photos must be JPEG or PNG.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Each file must be 10 MB or smaller.')
      return
    }

    setUploading((current) => ({ ...current, [field]: true }))
    setError('')
    const previousPath = form[field]
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
    const path = `${student.student_id}/${applicationId}/${field}/${crypto.randomUUID()}-${safeName}`
    const { data, error: uploadError } = await supabase.storage.from(storageBucket).upload(path, file, {
      contentType: file.type,
      upsert: false,
    })
    if (uploadError) {
      setError(`File upload failed: ${getDatabaseErrorMessage(uploadError)} Confirm the private "${storageBucket}" bucket and its access policies are configured in Supabase.`)
      setUploading((current) => ({ ...current, [field]: false }))
      return
    }
    const { data: updatedRow, error: pathError } = await supabase
      .from('outboundapplication')
      .update({ [field]: data.path })
      .eq('application_id', applicationId)
      .eq('student_id', student.student_id)
      .select('application_id')
      .maybeSingle()
    if (pathError || !updatedRow) {
      const { error: removeError } = await supabase.storage.from(storageBucket).remove([data.path])
      setError(pathError ? getDatabaseErrorMessage(pathError) : 'The file path could not be saved to the application.')
      if (removeError) setError((currentError) => `${currentError} The uploaded file could not be removed: ${getDatabaseErrorMessage(removeError)}`)
    } else {
      setForm((current) => ({ ...current, [field]: data.path }))
      if (previousPath && previousPath !== data.path) {
        const { error: removeError } = await supabase.storage.from(storageBucket).remove([previousPath])
        if (removeError) {
          setError(`The new file was uploaded, but the previous file could not be deleted: ${getDatabaseErrorMessage(removeError)}`)
        }
      }
    }
    setUploading((current) => ({ ...current, [field]: false }))
  }

  const toggleTerm = (index) => {
    setAcceptedTerms((current) => current.map((isAccepted, termIndex) => termIndex === index ? !isAccepted : isAccepted))
  }

  if (loading) {
    return <section className="portal-page"><div className="portal-card" role="status">Loading your outbound applications…</div></section>
  }

  if (!student) {
    return (
      <section className="portal-page">
        <div className="portal-card">
          <span className="auth-card__eyebrow">KU student portal</span>
          <h1>Outbound application unavailable</h1>
          <p className="outbound-application__error" role="alert">{error}</p>
          <Link className="btn btn--secondary" to="/portal">Back to portal</Link>
        </div>
      </section>
    )
  }

  const renderApplicationsPage = (
    <>
      <h1 id="outbound-heading">Your outbound applications</h1>
      <p>Start an application for an open KU semester or continue a saved draft.</p>
      <div className="outbound-new-application">
        <label className="outbound-form__field">
          <span>Open KU semester</span>
          <select
            value={form.semester_applied_for || ''}
            onChange={(event) => {
              setForm((current) => ({ ...current, semester_applied_for: event.target.value }))
              setError('')
            }}
          >
            <option value="">Select a cycle</option>
            {openCycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>{cycle.semester} {cycle.academic_year}</option>
            ))}
          </select>
        </label>
        <button className="btn btn--primary" type="button" onClick={startNewApplication} disabled={openCycles.length === 0}>
          Start new application
        </button>
      </div>
      {openCycles.length === 0 && <p>No KU semester is currently accepting applications.</p>}
      {applications.length > 0 ? (
        <div className="outbound-application-list">
          <h2 className="portal-section-heading">Your applications</h2>
          {applications.map((application) => {
            const cycle = cycles.find((item) => Number(item.id) === Number(application.semester_applied_for))
            const university = universities.find((item) => Number(item.university_id) === Number(application.university_id))
            return (
              <article className="outbound-application-list__item" key={application.application_id}>
                <div>
                  <h3>{cycle ? `${cycle.semester} ${cycle.academic_year}` : 'KU semester'}</h3>
                  <p>Application #{application.application_id}{university ? ` · ${university.name}` : ''}</p>
                </div>
                <span className={`outbound-application-list__status outbound-application-list__status--${application.application_status?.toLowerCase()}`}>
                  {application.application_status}
                </span>
                {application.application_status === 'Draft' && (
                  <button className="btn btn--secondary" type="button" onClick={() => openApplication(application.application_id)}>
                    Continue draft
                  </button>
                )}
                {application.application_status !== 'Draft' && (
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={() => navigate(`/portal/outbound-application/${application.application_id}/submitted`)}
                  >
                    View summary
                  </button>
                )}
              </article>
            )
          })}
        </div>
      ) : <p className="outbound-application__empty">You do not have any applications yet.</p>}
      {(error || message) && (
        <p className={error ? 'outbound-application__error' : 'outbound-application__message'} role={error ? 'alert' : 'status'}>
          {error || message}
        </p>
      )}
      <Link className="btn btn--secondary" to="/portal">Back to portal</Link>
    </>
  )

  const renderWizardPage = (pageIndex) => (
    <>
      <nav className="outbound-progress" aria-label="Application progress">
        {steps.map((item, index) => (
          <div className="outbound-progress__step" key={item.title} aria-current={pageIndex === index ? 'step' : undefined}>
            <span className="outbound-progress__label">
              <span className="outbound-progress__number">{String(index + 1).padStart(2, '0')}</span>
              <span className="outbound-progress__title"> · {item.title}</span>
            </span>
            <span className="outbound-progress__track" aria-hidden="true">
              <span
                className="outbound-progress__fill"
                style={{ '--outbound-progress': `${index < pageIndex ? 100 : index === pageIndex ? scrollProgress : 0}%` }}
              />
            </span>
          </div>
        ))}
      </nav>
      <form className="outbound-form" onSubmit={pageIndex === steps.length - 1 ? handleSubmit : handleNext} noValidate>
        <div ref={pageContentRef} className="outbound-form__scroll">
          {pageIndex === 0 && (
            <PersonalInformationPage
              form={form}
              onChange={updateField}
              onBlur={validatePersonalFieldOnBlur}
              fieldErrors={personalFieldErrors}
              countries={countries}
            />
          )}
          {pageIndex === 1 && (
            <AcademicInformationPage
              form={form}
              onChange={updateField}
              onBlur={validateAcademicFieldOnBlur}
              fieldErrors={academicFieldErrors}
              showCreditsWarning={Boolean(getCreditsWarning(form))}
            />
          )}
          {pageIndex === 2 && (
            <ExchangeDocumentsPage
              form={form}
              onChange={updateField}
              cycles={cycles.filter((cycle) => isCycleOpen(cycle) || Number(cycle.id) === Number(form.semester_applied_for))
                .map((cycle) => ({ ...cycle, id: String(cycle.id) }))}
              universities={universities}
              onUpload={uploadFile}
              uploading={uploading}
            />
          )}
          {pageIndex === 3 && <TermsPage accepted={acceptedTerms} onChange={toggleTerm} />}
          {error && <p className="outbound-application__error" role="alert">{error}</p>}
          {message && <p className="outbound-application__message" role="status">{message}</p>}
        </div>
        <div className="outbound-form__actions">
          {draftSaveStatus && (
            <p className="outbound-application__message" role="status">
              {draftSaveStatus === 'pending' && 'Unsaved changes'}
              {draftSaveStatus === 'saving' && 'Saving changes…'}
              {draftSaveStatus === 'saved' && 'Changes saved'}
              {draftSaveStatus === 'error' && 'Changes could not be saved.'}
            </p>
          )}
          <button
            className="btn btn--secondary"
            type="button"
            onClick={() => {
              setError('')
              setMessage('')
              if (pageIndex === 0) resetWizard()
              else {
                const routeId = routeApplicationId || applicationId || 'new'
                setStep(pageIndex - 1)
                navigate(`/portal/outbound-application/${routeId}/${steps[pageIndex - 1].path}`)
              }
            }}
            disabled={saving}
          >
            {pageIndex === 0 ? 'Back to applications' : 'Back'}
          </button>
          <div className="outbound-form__actions-end">
            <button className="btn btn--secondary" type="button" onClick={handleSaveDraft} disabled={saving || Object.values(uploading).some(Boolean)}>
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            {pageIndex === steps.length - 1 ? (
              <button className="btn btn--primary" type="submit" disabled={!canSubmit || saving || Object.values(uploading).some(Boolean)}>
                {saving ? 'Submitting…' : 'Submit application'}
              </button>
            ) : (
              <button className="btn btn--primary" type="submit" disabled={saving || Object.values(uploading).some(Boolean)}>
                Next
              </button>
            )}
          </div>
        </div>
      </form>
    </>
  )

  const saveEditedApplication = (edited) => {
    setApplications((items) => items.map((item) => (
      String(item.application_id) === String(submittedApplication.application_id) ? { ...item, ...edited } : item
    )))
    setEditingApplicationId(null)
    navigate(`/portal/outbound-application/${edited.application_id}/submitted`, { replace: true })
  }

  const renderSubmittedPage = submittedApplication && String(editingApplicationId) === String(submittedApplication.application_id) ? (
    <section className="outbound-receipt">
      <OutboundApplicationEditor
        application={submittedApplication}
        countries={countries}
        cycles={cycles}
        universities={universities}
        onSaved={saveEditedApplication}
        onCancel={() => setEditingApplicationId(null)}
      />
    </section>
  ) : submittedApplication ? (
    <ApplicationReceipt
      onEdit={() => setEditingApplicationId(submittedApplication.application_id)}
      application={submittedApplication}
      studentId={student.student_id}
      countries={countries}
      cycles={cycles}
      universities={universities}
      onDownload={() => window.print()}
      onBack={() => navigate('/portal/outbound-application')}
      onRequestWithdrawal={requestWithdrawal}
      withdrawalState={withdrawalState}
      withdrawalReason={withdrawalReason}
      isConfirmingWithdrawal={isConfirmingWithdrawal}
      onWithdrawalReasonChange={(event) => setWithdrawalReason(event.target.value)}
      onCancelWithdrawal={() => {
        setIsConfirmingWithdrawal(false)
        setWithdrawalReason('')
        setWithdrawalState({ loading: false, error: '', message: '' })
      }}
    />
  ) : (
    <section className="outbound-receipt" aria-live="polite">
      <h1>Application unavailable</h1>
      <p role={receiptError ? 'alert' : 'status'}>{receiptError || 'Loading your submitted application…'}</p>
      <button className="btn btn--secondary" type="button" onClick={() => navigate('/portal/outbound-application')}>
        Back to applications
      </button>
    </section>
  )

  return (
    <section
      ref={wizardScrollRef}
      className={`portal-page outbound-application${routeStep >= 0 ? ' outbound-application--wizard' : ''}${submittedRouteId ? ' outbound-application--receipt-page' : ''}`}
      aria-label={routeStep >= 0 ? 'Outbound application' : undefined}
      aria-labelledby={routeStep < 0 ? 'outbound-heading' : undefined}
    >
      <div className="portal-card portal-card--wide outbound-application__card">
        {routeStep < 0 && <span className="auth-card__eyebrow">KU student portal</span>}
        <Routes>
          <Route index element={renderApplicationsPage} />
          <Route path=":applicationId/submitted" element={renderSubmittedPage} />
          {steps.flatMap((item, index) => [
            <Route key={`new-${item.path}`} path={`new/${item.path}`} element={renderWizardPage(index)} />,
            <Route key={`draft-${item.path}`} path={`:applicationId/${item.path}`} element={renderWizardPage(index)} />,
          ])}
          <Route path="*" element={<Navigate to="/portal/outbound-application" replace />} />
        </Routes>
      </div>
    </section>
  )
}

export default OutboundApplication
