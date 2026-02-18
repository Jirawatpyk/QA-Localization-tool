import { createBrowserClient as _createBrowserClient } from '@supabase/ssr'

// Browser client for Client Components — Auth, Realtime
// NEVER use for DB queries — use Drizzle ORM instead
// NOTE: process.env used directly because env.ts imports 'server-only' (not browser-safe).
// NEXT_PUBLIC_* vars are inlined at build time by Next.js.
export function createBrowserClient() {
  return _createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
