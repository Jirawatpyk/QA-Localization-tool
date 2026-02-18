import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock Supabase server client
const mockGetClaims = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    auth: {
      getClaims: mockGetClaims,
    },
  })),
}))

describe('getCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return null when not authenticated', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: { message: 'No session' } })

    const { getCurrentUser } = await import('./getCurrentUser')
    const result = await getCurrentUser()

    expect(result).toBeNull()
  })

  it('should return null when claims have no tenant_id', async () => {
    mockGetClaims.mockResolvedValue({
      data: {
        claims: {
          sub: 'user-1',
          email: 'test@example.com',
        },
      },
      error: null,
    })

    const { getCurrentUser } = await import('./getCurrentUser')
    const result = await getCurrentUser()

    expect(result).toBeNull()
  })

  it('should return null when claims have "none" values (pre-setupNewUser)', async () => {
    mockGetClaims.mockResolvedValue({
      data: {
        claims: {
          sub: 'user-1',
          email: 'test@example.com',
          tenant_id: 'none',
          user_role: 'none',
        },
      },
      error: null,
    })

    const { getCurrentUser } = await import('./getCurrentUser')
    const result = await getCurrentUser()

    expect(result).toBeNull()
  })

  it('should return null when role is not a valid AppRole', async () => {
    mockGetClaims.mockResolvedValue({
      data: {
        claims: {
          sub: 'user-1',
          email: 'test@example.com',
          tenant_id: 'tenant-1',
          user_role: 'superadmin',
        },
      },
      error: null,
    })

    const { getCurrentUser } = await import('./getCurrentUser')
    const result = await getCurrentUser()

    expect(result).toBeNull()
  })

  it('should return CurrentUser when authenticated with valid claims', async () => {
    mockGetClaims.mockResolvedValue({
      data: {
        claims: {
          sub: 'user-1',
          email: 'admin@example.com',
          tenant_id: 'tenant-1',
          user_role: 'admin',
        },
      },
      error: null,
    })

    const { getCurrentUser } = await import('./getCurrentUser')
    const result = await getCurrentUser()

    expect(result).toEqual({
      id: 'user-1',
      email: 'admin@example.com',
      tenantId: 'tenant-1',
      role: 'admin',
    })
  })
})
