import { defineConfig } from 'drizzle-kit'

// Exception: process.env.DATABASE_URL! is acceptable here because drizzle.config.ts
// runs via Drizzle Kit CLI (outside Next.js runtime) and cannot import @/lib/env
// which has `import 'server-only'`. This is NOT a violation of Anti-Pattern #11.
export default defineConfig({
  schema: './src/db/schema',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
