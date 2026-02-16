import 'server-only'

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env } from '@/lib/env'

// Connect via pooler URL (port 6543), NOT direct (port 5432)
const client = postgres(env.DATABASE_URL, {
  prepare: false, // Required for Supabase Transaction mode pooling
})

export const connection = drizzle(client)
