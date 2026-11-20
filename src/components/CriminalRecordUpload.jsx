import { useState } from 'react'
import { supabase } from '../supabase'
import { uploadReplacementFiles, removeUploadedFiles } from '../applicationFiles'
import { getDatabaseErrorMessage } from '../databaseErrors'
import ReplacementFileField from './ReplacementFileField'

export default function CriminalRecordUpload({ application, onSaved }) {
  const [file, setFile] = useState(null)
  const [state, setState] = useState({ saving: false, error: '', message: '' })

  const save = async (event) => {
    event.preventDefault()
    if (!file || state.saving) return
    setState({ saving: true, error: '', message: '' })
    let uploaded = {}
    try {
      uploaded = await uploadReplacementFiles('inbound-application-files', application, { criminal_record_certificate: file })
      const { data, error } = await supabase.rpc('save_inbound_criminal_record', {
        requested_application_id: application.application_id,
        requested_certificate_path: uploaded.criminal_record_certificate,
      })
      if (error) throw error
      onSaved(data)
      setFile(null)
      setState({ saving: false, error: '', message: 'Certificate saved for the KU coordinator to review. Your approval remains conditional until the embassy stamp is verified.' })
    } catch (error) {
      await removeUploadedFiles('inbound-application-files', Object.values(uploaded))
      setState({ saving: false, error: getDatabaseErrorMessage(error), message: '' })
    }
  }

  return (
    <section className="coordinator-review__panel" aria-labelledby="criminal-record-heading">
      <h2 id="criminal-record-heading">Criminal-record certificate</h2>
      <p>Upload a certificate stamped by your closest Kuwaiti embassy for the KU coordinator to review before unconditional approval.</p>
      <p>Contact the Kuwaiti embassy in your country to learn the health-insurance requirements after conditional approval.</p>
      <form onSubmit={save}>
        <ReplacementFileField label="Criminal-record certificate" field="criminal_record_certificate" currentPath={application.criminal_record_certificate} onChange={(_field, selected) => setFile(selected)} disabled={state.saving} />
        {state.error && <p className="auth-form__error" role="alert">{state.error}</p>}
        {state.message && <p role="status">{state.message}</p>}
        <button className="btn btn--primary" disabled={!file || state.saving}>{state.saving ? 'Saving…' : 'Save certificate for review'}</button>
      </form>
    </section>
  )
}
