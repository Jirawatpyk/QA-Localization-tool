vi.mock('server-only', () => ({}))

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: vi.fn(),
}))

const mockSet = vi.fn().mockReturnThis()
const mockWhere = vi.fn().mockResolvedValue(undefined)
const mockUpdate = vi.fn((..._args: unknown[]) => ({ set: mockSet }))
// Chain: db.update(table) → { set } → mockSet returns { where } → mockWhere resolves
mockSet.mockReturnValue({ where: mockWhere })

vi.mock('@/db/client', () => ({
  db: {
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}))

vi.mock('@/db/schema/users', () => ({
  users: { id: 'id', metadata: 'metadata' },
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

import { getCurrentUser } from '@/lib/auth/getCurrentUser'

import { updateTourState } from './updateTourState.action'

describe('updateTourState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return UNAUTHORIZED when user not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)

    const result = await updateTourState({ action: 'complete', tourId: 'setup' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UNAUTHORIZED')
    }
  })

  it('should return VALIDATION_ERROR for invalid input', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-1',
      email: 'test@test.com',
      tenantId: 'ten-1',
      role: 'qa_reviewer',
      displayName: 'Test',
      metadata: null,
    })

    const result = await updateTourState({ action: 'invalid' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should set setup_tour_completed with ISO 8601 on complete', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-1',
      email: 'test@test.com',
      tenantId: 'ten-1',
      role: 'qa_reviewer',
      displayName: 'Test',
      metadata: null,
    })

    const result = await updateTourState({ action: 'complete', tourId: 'setup' })

    expect(result.success).toBe(true)
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          setup_tour_completed: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        }),
      }),
    )
  })

  it('should clear dismissed_at_step.setup on complete', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-1',
      email: 'test@test.com',
      tenantId: 'ten-1',
      role: 'qa_reviewer',
      displayName: 'Test',
      metadata: { dismissed_at_step: { setup: 2 } },
    })

    await updateTourState({ action: 'complete', tourId: 'setup' })

    const setArg = mockSet.mock.calls[0]?.[0] as
      | { metadata?: { dismissed_at_step?: { setup?: number | null } } }
      | undefined
    expect(setArg?.metadata?.dismissed_at_step?.setup).toBeNull()
  })

  it('should set dismissed_at_step on dismiss', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-1',
      email: 'test@test.com',
      tenantId: 'ten-1',
      role: 'qa_reviewer',
      displayName: 'Test',
      metadata: null,
    })

    await updateTourState({ action: 'dismiss', tourId: 'setup', dismissedAtStep: 3 })

    const setArg = mockSet.mock.calls[0]?.[0] as
      | { metadata?: { dismissed_at_step?: { setup?: number } } }
      | undefined
    expect(setArg?.metadata?.dismissed_at_step?.setup).toBe(3)
  })

  it('should clear both fields on restart', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-1',
      email: 'test@test.com',
      tenantId: 'ten-1',
      role: 'qa_reviewer',
      displayName: 'Test',
      metadata: { setup_tour_completed: '2026-01-01T00:00:00Z', dismissed_at_step: { setup: 2 } },
    })

    await updateTourState({ action: 'restart', tourId: 'setup' })

    const setArg = mockSet.mock.calls[0]?.[0] as
      | {
          metadata?: {
            setup_tour_completed?: string | null
            dismissed_at_step?: { setup?: number | null }
          }
        }
      | undefined
    expect(setArg?.metadata?.setup_tour_completed).toBeNull()
    expect(setArg?.metadata?.dismissed_at_step?.setup).toBeNull()
  })

  it('should write audit log on successful update', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-1',
      email: 'test@test.com',
      tenantId: 'ten-1',
      role: 'qa_reviewer',
      displayName: 'Test',
      metadata: null,
    })

    await updateTourState({ action: 'complete', tourId: 'setup' })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'ten-1',
        userId: 'usr-1',
        entityType: 'user',
        entityId: 'usr-1',
        action: 'tour_state.complete',
      }),
    )
  })
})
