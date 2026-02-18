import 'server-only'

import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  INNGEST_EVENT_KEY: z.string(),
  INNGEST_SIGNING_KEY: z.string(),
  OPENAI_API_KEY: z.string(),
  ANTHROPIC_API_KEY: z.string(),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string(),
  DATABASE_URL: z.string().url(),
})

// Lazy evaluation: validates on first access, not at module load.
// This allows `next build` to succeed without env vars while still
// failing fast at runtime when any server code actually runs.
let _env: z.infer<typeof envSchema> | undefined

export const env = new Proxy({} as z.infer<typeof envSchema>, {
  get(_target, prop: string) {
    if (!_env) {
      _env = envSchema.parse(process.env)
    }
    return _env[prop as keyof z.infer<typeof envSchema>]
  },
})
