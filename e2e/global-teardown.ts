import { createClient } from '@supabase/supabase-js'

/**
 * Playwright global teardown — cleans up E2E test users from Supabase Auth.
 *
 * Only deletes EPHEMERAL users created per-run with timestamp emails like:
 *   e2e-1740100000000@test.local, e2e-g14-1740100000000@test.local
 *
 * Preserves PERSISTENT users with fixed emails like:
 *   admin@test.local, e2e-tax16@test.local, first-time@test.local
 *
 * Pattern: e2e-{optional-prefix}{13-digit-timestamp}@test.local
 */
export default async function globalTeardown() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[e2e-teardown] Missing SUPABASE env vars — skipping user cleanup')
    return
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // List all users (paginate in case there are many)
  let page = 1
  const perPage = 100
  let deletedCount = 0

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })

    if (error) {
      console.warn(`[e2e-teardown] Failed to list users (page ${page}):`, error.message)
      break
    }

    // Match only timestamp-based ephemeral emails (e.g. e2e-1740100000000@test.local)
    // Exclude fixed emails like admin@test.local, e2e-tax16@test.local
    const e2eUsers = data.users.filter((u) => u.email?.match(/^e2e-.*\d{13,}@test\.local$/))

    for (const user of e2eUsers) {
      const { error: delError } = await admin.auth.admin.deleteUser(user.id)
      if (delError) {
        console.warn(`[e2e-teardown] Failed to delete ${user.email}:`, delError.message)
      } else {
        deletedCount++
      }
    }

    // No more pages
    if (data.users.length < perPage) break
    page++
  }

  if (deletedCount > 0) {
    console.warn(`[e2e-teardown] Cleaned up ${deletedCount} E2E test user(s)`)
  }
}
