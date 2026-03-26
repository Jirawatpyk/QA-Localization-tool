/**
 * Setup for AI integration tests.
 *
 * These tests call REAL AI APIs (OpenAI, Anthropic) — no mocking.
 * They verify the full prompt → AI call → structured output → schema parse flow.
 *
 * Required env vars:
 *   - OPENAI_API_KEY (for L2 tests)
 *   - ANTHROPIC_API_KEY (for L3 tests)
 *
 * Tests skip gracefully when the required API key is not available.
 *
 * Mocked modules:
 *   - server-only: no-op (not available in Node test process)
 *   - logger: silent stubs (prevent console noise)
 */

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
