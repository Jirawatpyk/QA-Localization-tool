import 'server-only'

// Re-export DB connection instance
// All DB queries must go through Drizzle ORM — never raw SQL in app code
export { connection as db } from './connection'
