import { vi } from 'vitest'

import type { DrizzleMockState } from './drizzleMock'

// createDrizzleMock is attached to globalThis in setup.ts (runs before vi.hoisted)
declare function createDrizzleMock(): {
  dbState: DrizzleMockState
  dbMockModule: Record<string, unknown>
}

/**
 * Shared mock factory for Server Action unit tests.
 *
 * Extracts the common vi.hoisted() pattern used across 6+ action test files
 * (noteFinding, updateNoteText, sourceIssueFinding, overrideSeverity,
 * addFinding, deleteFinding).
 *
 * Recommendation from TEA Test Quality Review (RV) — Story 4.3.
 *
 * Usage:
 * ```ts
 * const mocks = vi.hoisted(() => createActionTestMocks())
 *
 * vi.mock('server-only', () => ({}))
 * vi.mock('@/db/client', () => mocks.dbMockModule)
 * vi.mock('@/lib/auth/requireRole', () => ({
 *   requireRole: (...args: unknown[]) => mocks.mockRequireRole(...args),
 * }))
 * vi.mock('@/features/audit/actions/writeAuditLog', () => ({
 *   writeAuditLog: (...args: unknown[]) => mocks.mockWriteAuditLog(...args),
 * }))
 * vi.mock('@/db/helpers/withTenant', () => ({
 *   withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
 * }))
 * vi.mock('drizzle-orm', () => ({
 *   and: vi.fn((...args: unknown[]) => args),
 *   eq: vi.fn((...args: unknown[]) => args),
 * }))
 * vi.mock('@/lib/inngest/client', () => ({
 *   inngest: { send: (...args: unknown[]) => mocks.mockInngestSend(...args) },
 * }))
 * vi.mock('@/lib/logger', () => ({
 *   logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
 * }))
 * ```
 */
export function createActionTestMocks() {
  const { dbState, dbMockModule } = createDrizzleMock()

  const mockRequireRole = vi.fn((..._args: unknown[]) =>
    Promise.resolve({
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
      role: 'qa_reviewer',
    }),
  )

  const mockWriteAuditLog = vi.fn((..._args: unknown[]) => Promise.resolve())

  const mockInngestSend = vi.fn((..._args: unknown[]) => Promise.resolve())

  return {
    dbState,
    dbMockModule,
    mockRequireRole,
    mockWriteAuditLog,
    mockInngestSend,
  }
}

/** Standard valid UUIDs for action tests */
export const ACTION_TEST_IDS = {
  findingId: 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c',
  fileId: 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  projectId: 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e',
  tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  userId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  segmentId: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
} as const

/**
 * Shared helper: find a captured insert/update value by key+value match.
 * Used to verify what was written to DB in mock captures.
 */
export function findCapturedValues(
  state: { valuesCaptures: unknown[] },
  key: string,
  value: string,
): Record<string, unknown> | undefined {
  return state.valuesCaptures.find(
    (c: unknown) =>
      typeof c === 'object' && c !== null && (c as Record<string, string>)[key] === value,
  ) as Record<string, unknown> | undefined
}

/**
 * Reset dbState to clean state — call in beforeEach.
 */
export function resetDbState(dbState: {
  callIndex: number
  returnValues: unknown[]
  setCaptures: unknown[]
  valuesCaptures: unknown[]
  throwAtCallIndex: number | null
}): void {
  dbState.callIndex = 0
  dbState.returnValues = []
  dbState.setCaptures = []
  dbState.valuesCaptures = []
  dbState.throwAtCallIndex = null
}
