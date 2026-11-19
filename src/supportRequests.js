import { supabase } from './supabase'

// These lists and limits repeat what the support_request table and its storage bucket enforce
// (db/schema.sql), so the form can explain a problem before anything is sent.
export const SUPPORT_CATEGORIES = [
  'Application',
  'Documents',
  'Visa and residency',
  'Housing',
  'Courses and credits',
  'Other',
]
export const SUBJECT_LIMIT = 150
export const MESSAGE_LIMIT = 1000
export const MAX_ATTACHMENTS = 3
export const OPEN_REQUEST_LIMIT = 2
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

const SUPPORT_BUCKET = 'support-request-files'

export function supportReference(id) {
  return `SR-${String(id).padStart(6, '0')}`
}

// The database counts characters; a string's length counts UTF-16 units, which would count an
// emoji or some Arabic and CJK characters twice and reject a message the database accepts.
export function characterCount(text) {
  return [...text].length
}

export function attachmentName(path) {
  return path.split('/').pop().replace(/^\d+-/, '')
}

// Storage keys accept a limited character set, so other characters in a file name are replaced.
// The position prefix keeps two files apart when their names end up the same.
function storagePath(studentId, uploadId, file, position) {
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_')
  return `${studentId}/${uploadId}/${position + 1}-${safeName}`
}

export async function uploadSupportAttachments(studentId, files) {
  const storage = supabase.storage.from(SUPPORT_BUCKET)
  const uploadId = crypto.randomUUID()
  const paths = []
  for (const [position, file] of files.entries()) {
    const { data, error } = await storage.upload(storagePath(studentId, uploadId, file, position), file, {
      contentType: file.type,
      upsert: false,
    })
    if (error) {
      await removeSupportAttachments(paths)
      throw error
    }
    paths.push(data.path)
  }
  return paths
}

export async function removeSupportAttachments(paths) {
  if (paths.length > 0) await supabase.storage.from(SUPPORT_BUCKET).remove(paths)
}

// The tab is opened before the link is ready: a browser only allows a new tab straight from the
// click, not after waiting for the signed link.
export async function openSupportAttachment(path) {
  const tab = window.open('about:blank', '_blank')
  const { data, error } = await supabase.storage.from(SUPPORT_BUCKET).createSignedUrl(path, 3600)
  if (error) {
    tab?.close()
    throw error
  }
  if (tab) tab.location.href = data.signedUrl
  else window.location.assign(data.signedUrl)
}
