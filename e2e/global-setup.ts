import { createClient } from '@supabase/supabase-js'

/**
 * Playwright global setup — ensures infrastructure prerequisites exist
 * before E2E tests run.
 *
 * Currently:
 * - Creates the `project-files` storage bucket if it doesn't exist
 *   (required for upload E2E tests — upload route uses admin client
 *    to store files in this bucket)
 */
export default async function globalSetup(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[e2e-setup] Missing SUPABASE env vars — skipping infrastructure setup')
    return
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Ensure storage bucket exists for upload E2E tests
  const { error } = await admin.storage.createBucket('project-files', {
    public: false,
    fileSizeLimit: 15 * 1024 * 1024, // 15MB — matches MAX_FILE_SIZE_BYTES
  })

  if (error && !error.message.includes('already exists')) {
    console.error('[e2e-setup] Failed to create storage bucket:', error.message)
  } else {
    console.log('[e2e-setup] Storage bucket "project-files" ready')
  }
}
