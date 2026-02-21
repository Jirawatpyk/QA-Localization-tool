import { createClient } from '@supabase/supabase-js'

/**
 * Playwright global teardown — cleans up E2E test users from Supabase Auth.
 *
 * Deletes all users whose email matches `e2e-*@test.local` pattern.
 * Uses service_role key for admin.deleteUser() access.
 * Runs once after ALL test files complete.
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

    const e2eUsers = data.users.filter((u) => u.email?.match(/^e2e-.*@test\.local$/))

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
