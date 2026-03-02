/**
 * Shared setup for integration tests.
 * Mocks server-only modules that integration tests cannot import in Node environment.
 * Extracted from 8 duplicated mock blocks (TD-TEST-003).
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
