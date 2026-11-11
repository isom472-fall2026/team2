import { supabase } from './supabase'

// Countries, KU semesters and partner universities rarely change, yet almost every coordinator
// view read them again. Each is read once and shared until it is five minutes old, the
// signed-in user changes (what a user may read depends on who they are), or this app edits it.
// Results keep Supabase's { data, error } shape so callers handle them as they did a query.
const maxAgeMs = 5 * 60 * 1000

const readers = {
  countries: () => supabase.from('country').select('id, name').order('name'),
  cycles: () => supabase.from('exchange_cycle').select('*').order('id'),
  partnerUniversities: () => supabase
    .from('partneruniversity')
    .select('university_id, name, location, details, logo_url, latitude, longitude, airport_name, airport_code, airport_latitude, airport_longitude, available, deleted_at')
    .order('name'),
}

const cache = new Map()

function read(name) {
  const cached = cache.get(name)
  if (cached && Date.now() - cached.readAt < maxAgeMs) return cached.result
  const result = readers[name]()
    .then(({ data, error }) => ({ data: data || [], error }), (error) => ({ data: [], error }))
    .then((outcome) => {
      // A failed read is not kept, so the next view asks the database again.
      if (outcome.error && cache.get(name)?.result === result) cache.delete(name)
      return outcome
    })
  cache.set(name, { readAt: Date.now(), result })
  return result
}

export const getCountries = () => read('countries')
export const getCycles = () => read('cycles')
export const getPartnerUniversities = () => read('partnerUniversities')

export const forgetCycles = () => cache.delete('cycles')
export const forgetPartnerUniversities = () => cache.delete('partnerUniversities')
export const forgetReferenceData = () => cache.clear()

let cachedForUser
supabase.auth.onAuthStateChange((_event, session) => {
  const userId = session?.user?.id ?? null
  if (cachedForUser !== undefined && userId !== cachedForUser) cache.clear()
  cachedForUser = userId
})
