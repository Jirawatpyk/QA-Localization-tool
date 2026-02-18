import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock Supabase server client
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}))

describe('getCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return null when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } })

    const { getCurrentUser } = await import('./getCurrentUser')
    const result = await getCurrentUser()

    expect(result).toBeNull()
  })

  it('should return null when user has no tenant_id in claims', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          app_metadata: {},
        },
      },
      error: null,
    })

    const { getCurrentUser } = await import('./getCurrentUser')
    const result = await getCurrentUser()

    expect(result).toBeNull()
  })

  it('should return CurrentUser when authenticated with valid claims', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'admin@example.com',
          app_metadata: {
            tenant_id: 'tenant-1',
            user_role: 'admin',
          },
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
