// ATDD GREEN PHASE — Story 1.7: Dashboard, Notifications & Onboarding
// Tests unskipped after implementing updateTourState action.

vi.mock('server-only', () => ({}))

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: vi.fn(),
}))

// Drizzle chain mock: db.update(table).set(values).where(condition)
const mockWhere = vi.fn().mockResolvedValue(undefined)
const mockSet = vi.fn((..._args: unknown[]) => ({ where: mockWhere }))
const mockUpdate = vi.fn((..._args: unknown[]) => ({ set: mockSet }))

vi.mock('@/db/client', () => ({
  db: {
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}))

vi.mock('@/db/schema/users', () => ({
  users: { id: 'id', metadata: 'metadata' },
}))

vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { getCurrentUser } from '@/lib/auth/getCurrentUser'

describe('updateTourState action', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Restore chain after reset
    mockSet.mockReturnValue({ where: mockWhere })
    mockUpdate.mockReturnValue({ set: mockSet })
    mockWhere.mockResolvedValue(undefined)
  })

  it('[P1] should set setup_tour_completed to ISO 8601 timestamp when tour completed', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-test-001',
      email: 'qa@tenant-a.test',
      tenantId: 'ten-a-001',
      role: 'qa_reviewer',
      displayName: 'QA Reviewer',
      metadata: null,
    })

    const { updateTourState } = await import('@/features/onboarding/actions/updateTourState.action')
    const result = await updateTourState({ action: 'complete', tourId: 'setup' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ success: true })
    }

    // Verify DB update was called with ISO 8601 timestamp
    expect(mockUpdate).toHaveBeenCalled()
    const setCall = mockSet.mock.calls[0]?.[0] as
      | {
          metadata?: { setup_tour_completed?: string }
        }
      | undefined

    expect(setCall?.metadata?.setup_tour_completed).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
    )
  })

  it('[P1] should set dismissed_at_step.setup to 1-based step number when dismissed', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-test-001',
      email: 'qa@tenant-a.test',
      tenantId: 'ten-a-001',
      role: 'qa_reviewer',
      displayName: 'QA Reviewer',
      metadata: null,
    })

    const { updateTourState } = await import('@/features/onboarding/actions/updateTourState.action')
    const result = await updateTourState({ action: 'dismiss', tourId: 'setup', dismissedAtStep: 2 })

    expect(result.success).toBe(true)

    const setCall = mockSet.mock.calls[0]?.[0] as
      | {
          metadata?: { dismissed_at_step?: { setup?: number } }
        }
      | undefined

    expect(setCall?.metadata?.dismissed_at_step?.setup).toBe(2)
  })

  it('[P1] should clear dismissed_at_step when tour is completed via Skip All', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-test-001',
      email: 'qa@tenant-a.test',
      tenantId: 'ten-a-001',
      role: 'qa_reviewer',
      displayName: 'QA Reviewer',
      metadata: {
        dismissed_at_step: { setup: 2 },
      },
    })

    const { updateTourState } = await import('@/features/onboarding/actions/updateTourState.action')
    await updateTourState({ action: 'complete', tourId: 'setup' })

    const setCall = mockSet.mock.calls[0]?.[0] as
      | {
          metadata?: {
            setup_tour_completed?: string
            dismissed_at_step?: { setup?: number | null }
          }
        }
      | undefined

    expect(setCall?.metadata?.setup_tour_completed).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(setCall?.metadata?.dismissed_at_step?.setup ?? null).toBeNull()
  })

  it('[P2] should return error if user not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)

    const { updateTourState } = await import('@/features/onboarding/actions/updateTourState.action')
    const result = await updateTourState({ action: 'complete', tourId: 'setup' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/not authenticated/i)
    }
  })
})
