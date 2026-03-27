/**
 * Setup for AI integration tests.
 *
 * These tests call REAL AI APIs (OpenAI, Anthropic) — no mocking.
 * They verify the full prompt → AI call → structured output → schema parse flow.
 *
 * Required env vars (auto-loaded from .env.local):
 *   - OPENAI_API_KEY (for L2 + BT tests)
 *   - ANTHROPIC_API_KEY (for L3 tests)
 *
 * Tests skip gracefully when the required API key is not available.
 *
 * Mocked modules:
 *   - server-only: no-op (not available in Node test process)
 *   - logger: silent stubs (prevent console noise)
 */

import path from 'node:path'
import { loadEnvFile } from 'node:process'

// Auto-load .env.local so `npm run test:ai` works without dotenv-cli
try {
  loadEnvFile(path.resolve(import.meta.dirname, '../../../.env.local'))
} catch {
  // .env.local not found — tests will skip via skipIf guards
}

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
