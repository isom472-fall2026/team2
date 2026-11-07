import { supabase } from './supabase'

const documentTypes = ['application/pdf', 'image/jpeg', 'image/png']
const photoTypes = ['image/jpeg', 'image/png']

export function storedFileName(path) {
  const fileName = String(path ?? '').split('/').pop() || ''
  return fileName.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '')
}

export function getReplacementFileError(field, file) {
  if (field === 'profile_photo' && !photoTypes.includes(file.type)) return 'Personal photos must be JPEG or PNG files.'
  if (field !== 'profile_photo' && !documentTypes.includes(file.type)) return 'Choose a PDF, JPEG, or PNG file.'
  if (file.size > 10 * 1024 * 1024) return 'Choose a file no larger than 10 MB.'
  return ''
}

export async function removeUploadedFiles(bucket, paths) {
  if (paths.length === 0) return
  // The delete policies cover drafts only, so this can be refused after a failed edit. The
  // leftover file is then unused; the application keeps pointing at its previous document.
  await supabase.storage.from(bucket).remove(paths)
}

// Files go into the folder of the version being edited, which is the only place the storage
// policies and modify_*_application() accept them from.
export async function uploadReplacementFiles(bucket, application, files) {
  const uploaded = {}
  for (const [field, file] of Object.entries(files)) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
    const path = `${application.student_id}/${application.application_id}/${field}/${crypto.randomUUID()}-${safeName}`
    const { data, error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
    if (error) {
      await removeUploadedFiles(bucket, Object.values(uploaded))
      throw error
    }
    uploaded[field] = data.path
  }
  return uploaded
}
