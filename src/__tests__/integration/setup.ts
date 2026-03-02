/**
 * Shared setup for integration tests (Vitest `setupFiles`).
 * Mocks server-only modules that integration tests cannot import in Node environment.
 * Extracted from 8 duplicated mock blocks (TD-TEST-003).
 *
 * IMPORTANT: These `vi.mock()` calls apply GLOBALLY to all integration tests.
 * In Vitest, setupFiles mocks are hoisted and applied before each test file.
 *
 * Per-test override: Tests CAN override any mock below by calling `vi.mock()`
 * in their own file — Vitest will use the test-file factory over the setupFiles one.
 * However, be aware that the mock factory from setupFiles runs first during module
 * graph resolution, so imports within setupFiles scope see the global mock.
 *
 * Currently mocked modules:
 * - server-only: no-op (not available in Node test process)
 * - writeAuditLog: returns undefined (prevent side-effects)
 * - logger: silent stubs (prevent console noise)
 * - getCachedGlossaryTerms: returns [] (no glossary terms by default)
 */

vi.mock('server-only', () => ({}))

vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/cache/glossaryCache', () => ({
  getCachedGlossaryTerms: vi.fn().mockResolvedValue([]),
}))
