import 'server-only'

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env } from '@/lib/env'

import * as schema from './schema'

function createDb() {
  const queryClient = postgres(env.DATABASE_URL)
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
