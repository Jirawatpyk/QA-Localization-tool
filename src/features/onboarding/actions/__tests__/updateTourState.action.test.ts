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
  users: { id: 'id', tenantId: 'tenant_id', metadata: 'metadata' },
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

  it('[P1] should clear setup_tour_completed and dismissed_at_step when restart is called', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-test-001',
      email: 'qa@tenant-a.test',
      tenantId: 'ten-a-001',
      role: 'qa_reviewer',
      displayName: 'QA Reviewer',
      metadata: {
        setup_tour_completed: '2026-02-20T10:00:00.000Z',
        dismissed_at_step: { setup: 2 },
      },
    })

    const { updateTourState } = await import('@/features/onboarding/actions/updateTourState.action')
    const result = await updateTourState({ action: 'restart', tourId: 'setup' })

    expect(result.success).toBe(true)

    const setCall = mockSet.mock.calls[0]?.[0] as
      | {
          metadata?: {
            setup_tour_completed?: string | null
            dismissed_at_step?: { setup?: number | null }
          }
        }
      | undefined

    expect(setCall?.metadata?.setup_tour_completed).toBeNull()
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

  // ────────────────────────────────────────────────
  // ATDD RED PHASE — Story 2.8: tourId 'project' support
  // Tests skipped until type bug fix (Task 1: add 'project_tour_completed' to Pick)
  // AC Coverage: AC#1 (Task 1 — fix tourCompletedKey type)
  // ────────────────────────────────────────────────

  it('[P0] should set project_tour_completed to ISO 8601 timestamp when project tour completed', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-test-001',
      email: 'qa@tenant-a.test',
      tenantId: 'ten-a-001',
      role: 'qa_reviewer',
      displayName: 'QA Reviewer',
      metadata: null,
    })

    const { updateTourState } = await import('@/features/onboarding/actions/updateTourState.action')
    const result = await updateTourState({ action: 'complete', tourId: 'project' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ success: true })
    }

    // Verify DB update was called with project_tour_completed ISO 8601 timestamp
    expect(mockUpdate).toHaveBeenCalled()
    const setCall = mockSet.mock.calls[0]?.[0] as
      | {
          metadata?: { project_tour_completed?: string }
        }
      | undefined

    expect(setCall?.metadata?.project_tour_completed).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
    )
  })

  it('[P1] should set dismissed_at_step.project to 1-based step number when project tour dismissed', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-test-001',
      email: 'qa@tenant-a.test',
      tenantId: 'ten-a-001',
      role: 'qa_reviewer',
      displayName: 'QA Reviewer',
      metadata: null,
    })

    const { updateTourState } = await import('@/features/onboarding/actions/updateTourState.action')
    const result = await updateTourState({
      action: 'dismiss',
      tourId: 'project',
      dismissedAtStep: 1,
    })

    expect(result.success).toBe(true)

    const setCall = mockSet.mock.calls[0]?.[0] as
      | {
          metadata?: { dismissed_at_step?: { project?: number } }
        }
      | undefined

    expect(setCall?.metadata?.dismissed_at_step?.project).toBe(1)
  })

  it('[P1] should clear project_tour_completed and dismissed_at_step.project when project tour restarted', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-test-001',
      email: 'qa@tenant-a.test',
      tenantId: 'ten-a-001',
      role: 'qa_reviewer',
      displayName: 'QA Reviewer',
      metadata: {
        project_tour_completed: '2026-02-20T10:00:00.000Z',
        dismissed_at_step: { project: 2 },
      },
    })

    const { updateTourState } = await import('@/features/onboarding/actions/updateTourState.action')
    const result = await updateTourState({ action: 'restart', tourId: 'project' })

    expect(result.success).toBe(true)

    const setCall = mockSet.mock.calls[0]?.[0] as
      | {
          metadata?: {
            project_tour_completed?: string | null
            dismissed_at_step?: { project?: number | null }
          }
        }
      | undefined

    expect(setCall?.metadata?.project_tour_completed).toBeNull()
    expect(setCall?.metadata?.dismissed_at_step?.project ?? null).toBeNull()
  })
})
