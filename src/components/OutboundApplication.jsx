import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from '../supabase'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { useAppStore } from '../stores/appStore'
import {
  getAcademicFieldError,
  getEnglishEligibilityError,
  isCurrentlyIneligible,
  majors,
  needsEnglish106,
  otherMajor,
  requiresEnglishTestProof,
} from '../studentExchangeEligibility'
import DateField from './DateField'
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
  english_test_type: '',
  english_test_meets_requirement: '',
  english_106_completed: '',
  language_proficiency: '',
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
    english_test_type: application.english_test_type ?? '',
    english_test_meets_requirement: application.english_test_meets_requirement === true
      ? 'yes'
      : application.english_test_meets_requirement === false ? 'no' : '',
    english_106_completed: application.english_106_completed === true
      ? 'yes'
      : application.english_106_completed === false ? 'no' : '',
    language_proficiency: application.language_proficiency ?? '',
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
  onEnglishChange,
  onBlur,
  fieldErrors,
  showCreditsWarning,
  onUpload,
  uploading,
  onDeleteIneligibleDraft,
  saving,
}) {
  const hasEnglishTest = ['IELTS', 'TOEFL iBT'].includes(form.english_test_type)

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
      <div className="outbound-form__section-heading">
        <h2>English proficiency</h2>
        <p>Meet the English proficiency requirement with a qualifying test score or English 106 (course code 9988106).</p>
      </div>
      <SelectField label="Have you taken IELTS or TOEFL?" name="english_test_type" value={form.english_test_type} onChange={onEnglishChange} required>
        <option value="">Choose an answer</option>
        <option value="IELTS">Yes, IELTS</option>
        <option value="TOEFL iBT">Yes, TOEFL iBT</option>
        <option value="None">No</option>
      </SelectField>
      {hasEnglishTest && (
        <SelectField
          label="Is your IELTS score greater than 6.0 or your TOEFL iBT score at least 60?"
          name="english_test_meets_requirement"
          value={form.english_test_meets_requirement}
          onChange={onEnglishChange}
          required
        >
          <option value="">Choose an answer</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </SelectField>
      )}
      {requiresEnglishTestProof(form) && (
        <div className="outbound-form__upload">
          <label className="outbound-form__field">
            <span>Upload your IELTS or TOEFL score report <span className="outbound-form__required" aria-hidden="true">*</span></span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(event) => onUpload('language_proficiency', event)}
              disabled={uploading.language_proficiency}
              required={!form.language_proficiency}
            />
          </label>
          {uploading.language_proficiency && <p role="status">Uploading score report…</p>}
          {form.language_proficiency && <p className="outbound-form__upload-success" role="status">{uploadedFileName(form.language_proficiency)} uploaded successfully.</p>}
        </div>
      )}
      {needsEnglish106(form) && (
        <SelectField
          label="Have you taken English 106 (course code 9988106)?"
          name="english_106_completed"
          value={form.english_106_completed}
          onChange={onEnglishChange}
          required
        >
          <option value="">Choose an answer</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </SelectField>
      )}
      {isCurrentlyIneligible(form) && (
        <section className="outbound-english-ineligible" role="alert">
          <h3>You are not currently eligible for the student exchange program.</h3>
          <p>You may delete this draft application and its uploaded files.</p>
          <button className="btn btn--danger" type="button" onClick={onDeleteIneligibleDraft} disabled={saving}>
            {saving ? 'Deleting…' : 'Delete application'}
          </button>
        </section>
      )}
    </div>
  )
}

function ExchangeDocumentsPage({ form, onChange, cycles, universities, onUpload, uploading }) {
  return (
    <div className="outbound-form__grid">
      <SelectField label="Exchange cycle" name="semester_applied_for" value={form.semester_applied_for || ''} onChange={onChange} required>
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
          <span>Profile photo (optional)</span>
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(event) => onUpload('profile_photo', event)}
            disabled={uploading.profile_photo}
          />
        </label>
        {uploading.profile_photo && <p role="status">Uploading profile photo…</p>}
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

function ApplicationReceipt({ application, studentId, countries, cycles, universities, onDownload, onBack, onRequestWithdrawal, withdrawalState, withdrawalReason, isConfirmingWithdrawal, onWithdrawalReasonChange, onCancelWithdrawal }) {
  const [uploadedPages, setUploadedPages] = useState([])
  const [imageError, setImageError] = useState('')
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [viewingImage, setViewingImage] = useState(null)
  const receiptRef = useRef(null)
  const statusClass = String(application.application_status || 'Unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
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
    ['English test', application.english_test_type],
    ['English test meets requirement', application.english_test_meets_requirement === true ? 'Yes' : application.english_test_meets_requirement === false ? 'No' : ''],
    ['English 106 completed', application.english_106_completed === true ? 'Yes' : application.english_106_completed === false ? 'No' : ''],
    ['English score report', uploadedFileName(application.language_proficiency)],
    ['GPA', application.gpa],
    ['Credits passed', application.credits_passed],
    ['Expected graduation', displayMonth(application.expected_graduation_semester)],
    ['Exchange cycle', cycleName ? `${cycleName.semester} ${cycleName.academic_year}` : application.semester_applied_for],
    ['Preferred partner university', universityName || application.university_id],
    ['Passport copy', uploadedFileName(application.passport_copy)],
    ['Academic transcript', uploadedFileName(application.transcript)],
    ['Profile photo', uploadedFileName(application.profile_photo)],
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
        ['Profile photo', application.profile_photo],
        ['English score report', application.language_proficiency],
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
  }, [application.application_id, application.civil_id_copy, application.language_proficiency, application.passport_copy, application.transcript, application.profile_photo])

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
      <span className="auth-card__eyebrow">{application.application_status === 'Rejected' ? 'Application not submitted' : 'Application submitted'}</span>
      <h1 id="outbound-receipt-heading">{application.application_status === 'Rejected' ? 'Your application was not submitted' : 'Your application was submitted successfully'}</h1>
      <p>{application.application_status === 'Rejected' ? 'This application was not submitted before the deadline.' : 'Keep this summary for your records.'}</p>
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
  const [uploading, setUploading] = useState({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [scrollProgress, setScrollProgress] = useState(0)
  const pageContentRef = useRef(null)
  const wizardScrollRef = useRef(null)

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

  const loadApplications = async (studentId) => {
    const { data, error: applicationsError } = await supabase
      .from('outboundapplication')
      .select('application_id, application_status, semester_applied_for, university_id, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
    if (applicationsError) throw applicationsError
    setApplications(data || [])
  }

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
      setForm(formFromApplication(data))
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
    if (personalInformationFieldNames.includes(name) && updatedValue !== '') {
      setEditedPersonalFields((current) => ({ ...current, [name]: true }))
    }
    if (['major', 'major_other', 'current_year_of_study', 'gpa', 'credits_passed', 'expected_graduation_semester'].includes(name) && updatedValue !== '') {
      setEditedAcademicFields((current) => ({ ...current, [name]: true }))
    }
    setError('')
    setMessage('')
  }

  const clearEnglishScoreFile = async () => {
    const previousPath = form.language_proficiency
    if (!previousPath) return true
    if (!applicationId) {
      setError('Save this draft before changing its English score report.')
      return false
    }

    setUploading((current) => ({ ...current, language_proficiency: true }))
    const { data, error: updateError } = await supabase
      .from('outboundapplication')
      .update({ language_proficiency: null })
      .eq('application_id', applicationId)
      .eq('student_id', student.student_id)
      .select('application_id')
      .maybeSingle()
    if (updateError || !data) {
      setError(updateError
        ? getDatabaseErrorMessage(updateError)
        : 'The English score report could not be cleared from the application.')
      setUploading((current) => ({ ...current, language_proficiency: false }))
      return false
    }

    setForm((current) => ({ ...current, language_proficiency: '' }))
    const { error: removeError } = await supabase.storage.from(storageBucket).remove([previousPath])
    if (removeError) {
      setError(`The score report was cleared from the application, but its file could not be deleted: ${getDatabaseErrorMessage(removeError)}`)
      setUploading((current) => ({ ...current, language_proficiency: false }))
      return false
    }
    setUploading((current) => ({ ...current, language_proficiency: false }))
    return true
  }

  const updateEnglishField = async (event) => {
    const { name, value } = event.target
    if (name === 'english_test_type') {
      setForm((current) => ({
        ...current,
        english_test_type: value,
        english_test_meets_requirement: '',
        english_106_completed: '',
      }))
    } else if (name === 'english_test_meets_requirement') {
      setForm((current) => ({
        ...current,
        english_test_meets_requirement: value,
        english_106_completed: '',
      }))
    } else {
      setForm((current) => ({ ...current, english_106_completed: value }))
    }
    setError('')
    setMessage('')

    const testChanged = name === 'english_test_type' && value !== form.english_test_type
    const testNoLongerQualifies = name === 'english_test_meets_requirement' && value !== 'yes'
    const coursePathSelected = name === 'english_106_completed' && value === 'yes'
    if (form.language_proficiency && (testChanged || testNoLongerQualifies || coursePathSelected)) {
      await clearEnglishScoreFile()
    }
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
      return getEnglishEligibilityError(form, { requireTestProof: true })
    }
    if (stepToValidate === 2) {
      if (!form.university_id || !form.semester_applied_for) return 'Choose a partner university and an open exchange cycle.'
      if (!form.civil_id_copy || !form.passport_copy || !form.transcript) {
        return 'Upload your Civil ID copy, passport copy, and academic transcript.'
      }
    }
    return ''
  }

  const applicationValues = (tos = false) => ({
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
    english_test_type: form.english_test_type || null,
    english_test_meets_requirement: form.english_test_meets_requirement === 'yes'
      ? true
      : form.english_test_meets_requirement === 'no' ? false : null,
    english_106_completed: form.english_106_completed === 'yes'
      ? true
      : form.english_106_completed === 'no' ? false : null,
    language_proficiency: requiresEnglishTestProof(form) ? form.language_proficiency || null : null,
    tos,
    university_id: form.university_id ? Number(form.university_id) : null,
    nationality: form.nationality ? Number(form.nationality) : null,
    passport_issuing_country: form.passport_issuing_country ? Number(form.passport_issuing_country) : null,
    semester_applied_for: Number(form.semester_applied_for),
    student_id: String(student.student_id),
    submitted_at: tos ? new Date().toISOString() : null,
  })

  const saveApplication = async ({ tos = false, status = 'Draft' } = {}) => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First and last name are required to save a draft.')
      return false
    }
    if (!form.semester_applied_for) {
      setError('Select an exchange cycle before saving this application.')
      return false
    }

    setSaving(true)
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
        .maybeSingle()
      if (duplicateError) {
        setError(getDatabaseErrorMessage(duplicateError))
        setSaving(false)
        return false
      }
      if (duplicate) {
        setError(duplicate.application_status === 'Draft'
          ? 'You already have an application for this cycle. Open it from your applications list to continue.'
          : 'You have already submitted an application for this cycle.')
        await loadApplications(student.student_id).catch((loadError) => setError(getDatabaseErrorMessage(loadError)))
        setSaving(false)
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
    setSaving(false)
    return savedApplicationId
  }

  const startNewApplication = () => {
    if (!form.semester_applied_for) {
      setError('Select an open exchange cycle to start an application.')
      return
    }
    const cycleAlreadyUsed = applications.some((application) => (
      Number(application.semester_applied_for) === Number(form.semester_applied_for)
    ))
    if (cycleAlreadyUsed) {
      setError('An application already exists for this cycle. Open it from your applications list.')
      return
    }
    setForm({ ...emptyForm, semester_applied_for: form.semester_applied_for })
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
    setForm(formFromApplication(data))
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

  const deleteIneligibleDraft = async () => {
    if (!applicationId || !window.confirm('Delete this draft application and all of its uploaded files? This cannot be undone.')) return

    setSaving(true)
    setError('')
    const filePaths = [
      form.civil_id_copy,
      form.passport_copy,
      form.transcript,
      form.profile_photo,
      form.language_proficiency,
    ].filter(Boolean)
    if (filePaths.length > 0) {
      const { error: removeError } = await supabase.storage.from(storageBucket).remove(filePaths)
      if (removeError) {
        setError(`The draft was not deleted because its uploaded files could not be removed: ${getDatabaseErrorMessage(removeError)}`)
        setSaving(false)
        return
      }
    }

    const { data, error: deleteError } = await supabase
      .from('outboundapplication')
      .delete()
      .eq('application_id', applicationId)
      .eq('student_id', student.student_id)
      .eq('application_status', 'Draft')
      .select('application_id')
      .maybeSingle()
    if (deleteError || !data) {
      setError(deleteError
        ? getDatabaseErrorMessage(deleteError)
        : 'The draft could not be deleted. It may no longer be a draft.')
      setSaving(false)
      return
    }

    setApplications((current) => current.filter((application) => application.application_id !== applicationId))
    setApplicationId(null)
    setForm(emptyForm)
    setStep(0)
    setSaving(false)
    setMessage('The ineligible draft application was deleted.')
    navigate('/portal/outbound-application')
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
      setError('Choose a PDF, JPEG, or PNG file. Profile photos must be JPEG or PNG.')
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
      <p>Start an application for an open exchange cycle or continue a saved draft.</p>
      <div className="outbound-new-application">
        <label className="outbound-form__field">
          <span>Open exchange cycle</span>
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
      {openCycles.length === 0 && <p>No exchange cycle is currently accepting applications.</p>}
      {applications.length > 0 ? (
        <div className="outbound-application-list">
          <h2 className="portal-section-heading">Your applications</h2>
          {applications.map((application) => {
            const cycle = cycles.find((item) => Number(item.id) === Number(application.semester_applied_for))
            const university = universities.find((item) => Number(item.university_id) === Number(application.university_id))
            return (
              <article className="outbound-application-list__item" key={application.application_id}>
                <div>
                  <h3>{cycle ? `${cycle.semester} ${cycle.academic_year}` : 'Exchange cycle'}</h3>
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
              onEnglishChange={updateEnglishField}
              onBlur={validateAcademicFieldOnBlur}
              fieldErrors={academicFieldErrors}
              showCreditsWarning={Boolean(getCreditsWarning(form))}
              onUpload={uploadFile}
              uploading={uploading}
              onDeleteIneligibleDraft={deleteIneligibleDraft}
              saving={saving}
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

  const renderSubmittedPage = submittedApplication ? (
    <ApplicationReceipt
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
