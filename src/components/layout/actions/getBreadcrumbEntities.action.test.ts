/**
 * TDD GREEN PHASE — Story 4.0: Review Infrastructure Setup
 * TD-TODO-001 Regression: getBreadcrumbEntities should resolve real entity names
 */
vi.mock('server-only', () => ({}))

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbState, dbMockModule } = vi.hoisted(() => {
  const state = {
    callIndex: 0,
    returnValues: [] as unknown[],
    valuesCaptures: [] as unknown[][],
    setCaptures: [] as unknown[][],
  }

  const createChain = (): Record<string, unknown> => {
    return new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            const idx = state.callIndex++
            const result = state.returnValues[idx] ?? []
            return (resolve: (v: unknown) => void) => resolve(result)
          }
          return (..._args: unknown[]) => createChain()
        },
      },
    )
  }

  return {
    dbState: state,
    dbMockModule: {
      db: new Proxy(
        {},
        {
          get() {
            return (..._args: unknown[]) => createChain()
          },
        },
      ),
    },
  }
})

vi.mock('@/db/client', () => dbMockModule)

const mockWithTenant = vi.fn((..._args: unknown[]) => 'tenant-filter')
vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: (...args: unknown[]) => mockWithTenant(...args),
}))

vi.mock('@/db/schema/projects', () => ({
  projects: { id: 'id', name: 'name', tenantId: 'tenant_id' },
}))

vi.mock('@/db/schema/files', () => ({
  files: { id: 'id', fileName: 'file_name', tenantId: 'tenant_id' },
}))

vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: vi.fn((..._args: unknown[]) =>
    Promise.resolve({
      id: 'usr-1',
      email: 'test@test.com',
      tenantId: 'ten-1',
      role: 'qa_reviewer' as const,
      displayName: 'Test',
      metadata: null,
    }),
  ),
}))

import { getBreadcrumbEntities } from '@/components/layout/actions/getBreadcrumbEntities.action'

describe('getBreadcrumbEntities — TD-TODO-001', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  it('[P1] TD2: should return real file name and project name from DB with withTenant', async () => {
    // First query returns project name, second returns file name
    dbState.returnValues = [[{ name: 'My Project' }], [{ fileName: 'report.sdlxliff' }]]

    const result = await getBreadcrumbEntities({
      projectId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      sessionId: 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.projectName).toBe('My Project')
      expect(result.data.sessionName).toBe('report.sdlxliff')
    }

    // Verify withTenant was used
    expect(mockWithTenant).toHaveBeenCalledTimes(2)
  })

  // ── Branch coverage: INVALID_INPUT ──

  it('should return INVALID_INPUT when input fails validation', async () => {
    const result = await getBreadcrumbEntities({
      projectId: 'not-a-uuid',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INVALID_INPUT')
    }
  })

  // ── Branch coverage: UNAUTHORIZED ──

  it('should return UNAUTHORIZED when user is not authenticated', async () => {
    const { getCurrentUser } = await import('@/lib/auth/getCurrentUser')
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null)

    const result = await getBreadcrumbEntities({
      projectId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UNAUTHORIZED')
    }
  })

  // ── Branch coverage: only projectId provided (no sessionId) ──

  it('should return only projectName when sessionId is not provided', async () => {
    dbState.returnValues = [[{ name: 'Solo Project' }]]

    const result = await getBreadcrumbEntities({
      projectId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.projectName).toBe('Solo Project')
      expect(result.data.sessionName).toBeUndefined()
    }
  })

  // ── Branch coverage: neither projectId nor sessionId ──

  it('should return empty entities when neither projectId nor sessionId provided', async () => {
    const result = await getBreadcrumbEntities({})

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.projectName).toBeUndefined()
      expect(result.data.sessionName).toBeUndefined()
    }
  })

  // ── Branch coverage: DB returns empty for project ──

  it('should omit projectName when project not found in DB', async () => {
    dbState.returnValues = [[], [{ fileName: 'found.xlf' }]] // empty project result

    const result = await getBreadcrumbEntities({
      projectId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      sessionId: 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.projectName).toBeUndefined()
      expect(result.data.sessionName).toBe('found.xlf')
    }
  })
})
