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
// The files upload side by side rather than one after another. If any fails, the ones that
// arrived are removed, so an edit never keeps half of its new documents.
export async function uploadReplacementFiles(bucket, application, files) {
  const results = await Promise.all(Object.entries(files).map(async ([field, file]) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
    const path = `${application.student_id}/${application.application_id}/${field}/${crypto.randomUUID()}-${safeName}`
    try {
      const { data, error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
      return { field, path: data?.path, error }
    } catch (error) {
      return { field, error }
    }
  }))
  const failed = results.find(({ error }) => error)
  if (failed) {
    await removeUploadedFiles(bucket, results.filter(({ error }) => !error).map(({ path }) => path))
    throw failed.error
  }
  return Object.fromEntries(results.map(({ field, path }) => [field, path]))
}
