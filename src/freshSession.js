// Right after sign-up or sign-in, Supabase's database API can refuse the brand-new session token
// as "JWT issued at future" when its clock runs behind the sign-in service's. The refusal happens
// before the database is reached, and the token becomes valid within seconds, so the request is
// repeated for a short while before the error is shown.
const retryDelaysMs = [1000, 2000, 3000, 4000, 5000]

export function isTokenIssuedInFuture(error) {
  return /issued at future/i.test(error?.message ?? '')
}

// `request` must build a new query each time, because a Supabase query runs only once.
export async function retryWhileTokenIsTooNew(request) {
  let result = await request()
  for (const delay of retryDelaysMs) {
    if (!isTokenIssuedInFuture(result.error)) return result
    await new Promise((resolve) => setTimeout(resolve, delay))
    result = await request()
  }
  return result
}
