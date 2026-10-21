const databaseErrorMessages = {
  '22P02': 'One of the submitted values has an invalid format.',
  '22001': 'One of the submitted values is longer than allowed.',
  '22003': 'One of the submitted numbers is outside the allowed range.',
  '23502': 'A required field is missing.',
  '23503': 'A related record is missing or is no longer available.',
  '23505': 'A record with these details already exists.',
  '23514': 'One of the submitted values does not meet the database requirements.',
  '42P17': 'The database access rules need attention. Please contact support.',
  '42501': 'You do not have permission to complete this action.',
  PGRST116: 'The requested record was not found or is not accessible.',
}

export function getDatabaseErrorMessage(error) {
  if (!error) return 'An unexpected database error occurred.'

  const code = typeof error.code === 'string' ? error.code : ''
  if (Object.prototype.hasOwnProperty.call(databaseErrorMessages, code)) {
    return databaseErrorMessages[code]
  }

  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }

  return 'The database request could not be completed. Please try again.'
}
