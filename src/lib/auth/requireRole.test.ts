import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock getCurrentUser
const mockGetCurrentUser = vi.fn()
vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}))

// Mock DB
const mockDbSelect = vi.fn()
vi.mock('@/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockDbSelect(),
        }),
      }),
    }),
  },
}))

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should throw UNAUTHORIZED when no user authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    const { requireRole } = await import('./requireRole')

    await expect(requireRole('admin')).rejects.toEqual({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Not authenticated',
    })
  })

  it('should allow admin on read operation via JWT claims', async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: 'user-1',
      email: 'admin@test.com',
      tenantId: 'tenant-1',
      role: 'admin',
    })

    const { requireRole } = await import('./requireRole')
    const result = await requireRole('admin', 'read')

    expect(result.role).toBe('admin')
    expect(result.id).toBe('user-1')
  })

  it('should reject qa_reviewer accessing admin features on read', async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: 'user-2',
      email: 'qa@test.com',
      tenantId: 'tenant-1',
      role: 'qa_reviewer',
    })

    const { requireRole } = await import('./requireRole')

    await expect(requireRole('admin', 'read')).rejects.toEqual({
      success: false,
      code: 'FORBIDDEN',
      error: 'Insufficient permissions',
    })
  })

  it('should allow admin through hierarchy for qa_reviewer required role', async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: 'user-1',
      email: 'admin@test.com',
      tenantId: 'tenant-1',
      role: 'admin',
    })

    const { requireRole } = await import('./requireRole')
    const result = await requireRole('qa_reviewer', 'read')

    expect(result.role).toBe('admin')
  })

  it('should check DB for write operations', async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: 'user-1',
      email: 'admin@test.com',
      tenantId: 'tenant-1',
      role: 'admin',
    })

    mockDbSelect.mockResolvedValue([{ role: 'admin' }])

    const { requireRole } = await import('./requireRole')
    const result = await requireRole('admin', 'write')

    expect(result.role).toBe('admin')
  })

  it('should reject write when DB role is insufficient', async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: 'user-2',
      email: 'qa@test.com',
      tenantId: 'tenant-1',
      role: 'admin', // JWT says admin (stale)
    })

    mockDbSelect.mockResolvedValue([{ role: 'qa_reviewer' }]) // DB says qa_reviewer (actual)

    const { requireRole } = await import('./requireRole')

    await expect(requireRole('admin', 'write')).rejects.toEqual({
      success: false,
      code: 'FORBIDDEN',
      error: 'Insufficient permissions',
    })
  })
})
