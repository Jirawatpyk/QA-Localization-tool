/** Validate redirect path — returns safe path or '/dashboard' fallback */
export function validateRedirectPath(rawNext: string | null): string {
  const path = rawNext ?? '/dashboard'
  const isSafePath =
    /^\/[a-zA-Z0-9\-._~:/?[\]@!$&'()*+,;=%]+$/.test(path) &&
    !path.startsWith('//') &&
    !path.includes('\\') &&
    !path.includes('#')
  return isSafePath ? path : '/dashboard'
}
