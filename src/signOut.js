import { supabase } from './supabase'

// Supabase removes the session from this device even when it cannot reach its server to end it
// there, and then reports that failure. The visitor is signed out either way, so the failure is
// not shown to them; the server-side session simply expires on its own.
export async function signOut() {
  await supabase.auth.signOut()
}
