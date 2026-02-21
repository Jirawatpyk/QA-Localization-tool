import 'server-only'

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env } from '@/lib/env'

import * as schema from './schema'

function createDb() {
  // Supabase Transaction Pooler (port 6543) does not support prepared statements.
  // Detect pooler port and disable prepared statements accordingly.
  const isTransactionPooler = env.DATABASE_URL.includes(':6543')
  const queryClient = postgres(env.DATABASE_URL, {
    prepare: !isTransactionPooler,
    connect_timeout: 10,
    idle_timeout: 20,
  })
  return drizzle(queryClient, { schema })
}

// Lazy initialization: creates DB client on first access, not at module load.
// This allows `next build` to succeed without env vars while still
// failing fast at runtime when any server code actually runs.
let _db: ReturnType<typeof createDb> | undefined

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop) {
    if (!_db) {
      _db = createDb()
    }
    return Reflect.get(_db, prop)
  },
})
