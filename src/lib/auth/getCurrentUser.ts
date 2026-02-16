import 'server-only'

// Gets current authenticated user from Supabase session
// Populated in Story 1.2
export type CurrentUser = {
  id: string
  email: string
  tenantId: string
  role: string
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Placeholder: will read from Supabase auth session
  return null
}
