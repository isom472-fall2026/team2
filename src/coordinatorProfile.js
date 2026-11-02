export function isKuCoordinatorProfile(profile, userEmail) {
  const profileEmailIsKu = profile.email?.trim().toLowerCase().endsWith('@ku.edu.kw')
  const authenticatedEmailIsKu = userEmail?.trim().toLowerCase().endsWith('@ku.edu.kw')
  const universityId = profile.university ?? profile.university_id
  return Number(universityId) === 4 || profileEmailIsKu || authenticatedEmailIsKu
}
