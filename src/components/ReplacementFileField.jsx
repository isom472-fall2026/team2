import { useState } from 'react'
import { getReplacementFileError, storedFileName } from '../applicationFiles'

export default function ReplacementFileField({ label, field, currentPath, onChange, disabled }) {
  const [error, setError] = useState('')
  const accept = field === 'profile_photo' ? 'image/jpeg,image/png' : 'application/pdf,image/jpeg,image/png'

  const chooseFile = (event) => {
    const file = event.target.files?.[0] || null
    const fileError = file ? getReplacementFileError(field, file) : ''
    setError(fileError)
    if (fileError) event.target.value = ''
    onChange(field, fileError ? null : file)
  }

  return (
    <label className="outbound-form__field">
      <span>{label}</span>
      <input type="file" accept={accept} onChange={chooseFile} disabled={disabled} aria-describedby={`${field}-current`} />
      <span className="replacement-file__current" id={`${field}-current`}>
        {currentPath ? `Current file: ${storedFileName(currentPath)}. Choose a file only to replace it.` : 'No file uploaded yet.'}
      </span>
      {error && <span className="outbound-form__field-error" role="alert">{error}</span>}
    </label>
  )
}
