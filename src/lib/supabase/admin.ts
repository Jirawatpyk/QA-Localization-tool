import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'

// Admin client — service_role key for admin operations, seed scripts, Inngest functions
// NEVER use in client code or expose service_role key
export function createAdminClient() {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
