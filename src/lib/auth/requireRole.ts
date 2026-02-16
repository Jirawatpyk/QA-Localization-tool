import 'server-only'

// RBAC M3 pattern — JWT claims for reads, DB query for writes
// Populated in Story 1.2 with actual Supabase auth
type Role = 'admin' | 'pm' | 'reviewer'

export async function requireRole(_role: Role): Promise<void> {
  // Placeholder: will check JWT claims for reads, DB for writes
  return
}
