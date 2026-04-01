import { describe, it, expect, vi, beforeEach } from 'vitest'

import { asTenantId } from '@/types/tenant'

const { dbState, dbMockModule } = vi.hoisted(() =>
  (
    globalThis as unknown as {
      createDrizzleMock: () => import('@/test/drizzleMock').DrizzleMockResult
    }
  ).createDrizzleMock(),
)
vi.mock('@/db/client', () => dbMockModule)
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
  createNotification,
  createBulkNotification,
  NOTIFICATION_TYPES,
} from './createNotification'

describe('createNotification', () => {
  const tenantId = asTenantId('00000000-0000-0000-0000-000000000001')

  beforeEach(() => {
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
  })

  it('should insert a notification with all fields', async () => {
    dbState.returnValues = [[{ id: 'notif-1' }]]

    await createNotification({
      tenantId,
      userId: 'user-1',
      type: NOTIFICATION_TYPES.FILE_ASSIGNED,
      title: "File 'test.sdlxliff' assigned to you",
      body: 'You have been assigned a new file for review',
      projectId: 'proj-1',
      metadata: { fileId: 'file-1' },
    })

    expect(dbState.valuesCaptures).toHaveLength(1)
    const captured = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(captured).toMatchObject({
      tenantId,
      userId: 'user-1',
      type: 'file_assigned',
      title: "File 'test.sdlxliff' assigned to you",
      body: 'You have been assigned a new file for review',
      projectId: 'proj-1',
      metadata: { fileId: 'file-1' },
    })
  })

  it('should not throw on DB error (non-blocking)', async () => {
    dbState.throwAtCallIndex = 0

    await expect(
      createNotification({
        tenantId,
        userId: 'user-1',
        type: NOTIFICATION_TYPES.FILE_ASSIGNED,
        title: 'Test',
        body: 'Test body',
      }),
    ).resolves.toBeUndefined()

    const { logger } = await import('@/lib/logger')
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'file_assigned', userId: 'user-1' }),
      'Failed to create notification',
    )
  })

  it('should export all notification type constants (8 existing + 3 new = 11)', () => {
    expect(NOTIFICATION_TYPES.FINDING_FLAGGED_FOR_NATIVE).toBe('finding_flagged_for_native')
    expect(NOTIFICATION_TYPES.NATIVE_REVIEW_COMPLETED).toBe('native_review_completed')
    expect(NOTIFICATION_TYPES.NATIVE_COMMENT_ADDED).toBe('native_comment_added')
    expect(NOTIFICATION_TYPES.LANGUAGE_PAIR_GRADUATED).toBe('language_pair_graduated')
    expect(NOTIFICATION_TYPES.FILE_ASSIGNED).toBe('file_assigned')
    expect(NOTIFICATION_TYPES.FILE_REASSIGNED).toBe('file_reassigned')
    expect(NOTIFICATION_TYPES.FILE_URGENT).toBe('file_urgent')
    expect(NOTIFICATION_TYPES.ASSIGNMENT_COMPLETED).toBe('assignment_completed')
    // Story 6.2a: 3 new types for 6-2b wiring
    expect(NOTIFICATION_TYPES.ANALYSIS_COMPLETE).toBe('analysis_complete')
    expect(NOTIFICATION_TYPES.GLOSSARY_UPDATED).toBe('glossary_updated')
    expect(NOTIFICATION_TYPES.AUTO_PASS_TRIGGERED).toBe('auto_pass_triggered')
    // Total: 11 constants
    expect(Object.keys(NOTIFICATION_TYPES)).toHaveLength(11)
  })
})

describe('createBulkNotification', () => {
  const tenantId = asTenantId('00000000-0000-0000-0000-000000000001')

  beforeEach(() => {
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
  })

  it('should insert notifications for multiple recipients', async () => {
    dbState.returnValues = [[]]

    await createBulkNotification({
      tenantId,
      recipients: [{ userId: 'user-1' }, { userId: 'user-2' }],
      type: NOTIFICATION_TYPES.LANGUAGE_PAIR_GRADUATED,
      title: 'Language pair ready',
      body: 'en->th has 5 files',
      projectId: 'proj-1',
    })

    expect(dbState.valuesCaptures).toHaveLength(1)
    const captured = dbState.valuesCaptures[0] as Array<Record<string, unknown>>
    expect(captured).toHaveLength(2)
    expect(captured[0]!.userId).toBe('user-1')
    expect(captured[1]!.userId).toBe('user-2')
  })

  it('should skip insert when recipients is empty', async () => {
    await createBulkNotification({
      tenantId,
      recipients: [],
      type: NOTIFICATION_TYPES.LANGUAGE_PAIR_GRADUATED,
      title: 'Test',
      body: 'Test',
    })

    expect(dbState.valuesCaptures).toHaveLength(0)
  })

  it('should not throw on DB error (non-blocking)', async () => {
    dbState.throwAtCallIndex = 0

    await expect(
      createBulkNotification({
        tenantId,
        recipients: [{ userId: 'user-1' }],
        type: NOTIFICATION_TYPES.FILE_ASSIGNED,
        title: 'Test',
        body: 'Test',
      }),
    ).resolves.toBeUndefined()
  })
})
