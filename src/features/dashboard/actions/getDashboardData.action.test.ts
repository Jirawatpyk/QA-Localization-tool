vi.mock('server-only', () => ({}))

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Build a chainable mock that supports any order of Drizzle method calls
function createChainMock(resolvedValue: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const handler = () =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            // Make it thenable — resolves with the value
            return (resolve: (v: unknown) => void) => resolve(resolvedValue)
          }
          // Any method call returns the same proxy
          return (..._args: unknown[]) => handler()
        },
      },
    )
  return { chain, handler }
}

let queryIndex = 0
const queryResults: unknown[] = []

vi.mock('@/db/client', () => ({
  db: {
    select: (..._args: unknown[]) => {
      const idx = queryIndex++
      const result = queryResults[idx] ?? []
      const { handler } = createChainMock(result)
      return handler()
    },
  },
}))

vi.mock('@/db/schema/files', () => ({
  files: {
    id: 'id',
    fileName: 'file_name',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    status: 'status',
    createdAt: 'created_at',
  },
}))

vi.mock('@/db/schema/projects', () => ({
  projects: { id: 'id', name: 'name' },
}))

vi.mock('@/db/schema/scores', () => ({
  scores: { id: 'id', fileId: 'file_id', tenantId: 'tenant_id', mqmScore: 'mqm_score' },
}))

vi.mock('@/db/schema/reviewActions', () => ({
  reviewActions: { tenantId: 'tenant_id', createdAt: 'created_at' },
}))

import { getDashboardData } from './getDashboardData.action'

describe('getDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryIndex = 0
    queryResults.length = 0
  })

  it('should return success with empty dashboard when no data', async () => {
    queryResults.push([], [{ count: 0 }], [{ count: 0 }])

    const result = await getDashboardData('ten-1', 'usr-1')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.recentFiles).toEqual([])
      expect(result.data.pendingReviewsCount).toBe(0)
      expect(result.data.teamActivityCount).toBe(0)
    }
  })

  it('should return recent files with ISO date strings', async () => {
    const mockDate = new Date('2026-02-20T10:00:00Z')
    queryResults.push(
      [
        {
          id: 'file-1',
          fileName: 'doc-47.xlf',
          projectId: 'proj-1',
          projectName: 'Project A',
          status: 'parsed',
          createdAt: mockDate,
          mqmScore: 97.5,
        },
      ],
      [{ count: 1 }],
      [{ count: 5 }],
    )

    const result = await getDashboardData('ten-1', 'usr-1')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.recentFiles).toHaveLength(1)
      expect(result.data.recentFiles[0]?.createdAt).toBe('2026-02-20T10:00:00.000Z')
      expect(result.data.recentFiles[0]?.mqmScore).toBe(97.5)
      expect(result.data.pendingReviewsCount).toBe(1)
      expect(result.data.teamActivityCount).toBe(5)
    }
  })

  it('should return null mqmScore when no score record', async () => {
    queryResults.push(
      [
        {
          id: 'file-2',
          fileName: 'doc-48.xlf',
          projectId: 'proj-1',
          projectName: 'Project A',
          status: 'uploaded',
          createdAt: new Date(),
          mqmScore: null,
        },
      ],
      [{ count: 0 }],
      [{ count: 0 }],
    )

    const result = await getDashboardData('ten-1', 'usr-1')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.recentFiles[0]?.mqmScore).toBeNull()
    }
  })

  it('should limit to 10 recent files', async () => {
    const files = Array.from({ length: 10 }, (_, i) => ({
      id: `file-${i}`,
      fileName: `doc-${i}.xlf`,
      projectId: 'proj-1',
      projectName: 'Project A',
      status: 'parsed',
      createdAt: new Date(),
      mqmScore: 95,
    }))
    queryResults.push(files, [{ count: 0 }], [{ count: 0 }])

    const result = await getDashboardData('ten-1', 'usr-1')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.recentFiles).toHaveLength(10)
    }
  })
})
