import path from 'path'

import { config } from 'dotenv'

// Load .env.local for RLS tests (needs real Supabase credentials)
config({ path: path.resolve(process.cwd(), '.env.local') })
