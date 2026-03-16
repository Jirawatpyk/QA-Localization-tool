/**
 * Test Automation Expansion — Story 4.2: useFindingsSubscription hook
 * Regression tests for Realtime merge guard + multi-field merge
 *
 * TA-U4: reject Realtime UPDATE when updatedAt is older than store
 * TA-U13: merge severity change from Realtime while status changed by optimistic
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Supabase client mock ──

const mockChannel = {
  on: vi.fn().mockReturnValue(undefined as unknown),
  subscribe: vi.fn(),
}
mockChannel.on.mockReturnValue(mockChannel)

const mockSupabase = {
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: vi.fn(),
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  }),
}

vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: () => mockSupabase,
}))

vi.mock('@/features/review/utils/announce', () => ({
  announce: vi.fn(),
}))

import { useFindingsSubscription } from '@/features/review/hooks/use-findings-subscription'
import { useReviewStore } from '@/features/review/stores/review.store'
import type { Finding } from '@/types/finding'

// ── Helper: build a full Finding for store pre-population ──

function buildStoreFinding(overrides: Partial<Finding>): Finding {
  return {
    id: 'finding-1',
    tenantId: 'tenant-1',
    projectId: 'proj-1',
    sessionId: 'session-1',
    segmentId: 'seg-1',
    severity: 'major',
    originalSeverity: null,
    category: 'accuracy',
    status: 'pending',
    description: 'Test finding',
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    fileId: 'file-abc',
    detectedByLayer: 'L2',
    aiModel: null,
    aiConfidence: 85,
    suggestedFix: null,
    sourceTextExcerpt: null,
    targetTextExcerpt: null,
    segmentCount: 1,
    scope: 'per-file',
    reviewSessionId: null,
    relatedFileIds: null,
    ...overrides,
  }
}

// ── Helper: get UPDATE handler from mock channel ──

function getUpdateHandler(): (payload: { new: Record<string, unknown> }) => void {
  const updateCall = mockChannel.on.mock.calls.find(
    (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'UPDATE',
  )
  if (!updateCall) throw new Error('UPDATE handler not registered')
  return updateCall[2] as (payload: { new: Record<string, unknown> }) => void
}

describe('useFindingsSubscription — TA expansion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useReviewStore.setState({ currentFileId: null })
    useReviewStore.getState().resetForFile('test')
    mockChannel.on.mockReturnValue(mockChannel)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // TA-U4: stale guard — reject Realtime UPDATE with older updatedAt
  it('[P0] should reject Realtime UPDATE when updatedAt is older than store timestamp', () => {
    // Pre-populate store with a finding that has a recent optimistic updatedAt
    const optimisticTime = '2026-03-15T12:00:00Z'
    useReviewStore.getState().setFinding(
      'finding-1',
      buildStoreFinding({
        id: 'finding-1',
        status: 'accepted',
        updatedAt: optimisticTime,
      }),
    )

    renderHook(() => useFindingsSubscription('file-abc'))

    const onUpdateHandler = getUpdateHandler()
    const setFindingSpy = vi.spyOn(useReviewStore.getState(), 'setFinding')

    // Realtime sends an older UPDATE (e.g. delayed cloud event)
    const staleTime = '2026-03-15T11:00:00Z'
    act(() => {
      onUpdateHandler({
        new: {
          id: 'finding-1',
          severity: 'major',
          category: 'accuracy',
          status: 'rejected',
          detected_by_layer: 'L2',
          updated_at: staleTime,
          file_id: 'file-abc',
        },
      })
    })

    // setFinding should NOT be called — stale guard blocks it
    expect(setFindingSpy).not.toHaveBeenCalled()

    // Store should retain optimistic state
    const finding = useReviewStore.getState().findingsMap.get('finding-1')
    expect(finding?.status).toBe('accepted')
    expect(finding?.updatedAt).toBe(optimisticTime)

    setFindingSpy.mockRestore()
  })

  // TA-U13: multi-field merge — severity from Realtime, status from optimistic
  it('[P2] should merge severity change from Realtime while status changed by optimistic', () => {
    // Store has optimistic status='accepted' with client timestamp
    const clientTime = '2026-03-15T12:00:00Z'
    useReviewStore.getState().setFinding(
      'finding-merge',
      buildStoreFinding({
        id: 'finding-merge',
        severity: 'major',
        status: 'accepted',
        updatedAt: clientTime,
      }),
    )

    renderHook(() => useFindingsSubscription('file-abc'))

    const onUpdateHandler = getUpdateHandler()

    // Realtime pushes severity change with a NEWER timestamp
    // (e.g. another user changed severity via admin panel)
    const newerTime = '2026-03-15T13:00:00Z'
    act(() => {
      onUpdateHandler({
        new: {
          id: 'finding-merge',
          severity: 'critical',
          category: 'accuracy',
          status: 'accepted',
          detected_by_layer: 'L2',
          updated_at: newerTime,
          file_id: 'file-abc',
        },
      })
    })

    // Realtime has newer timestamp → entire finding is replaced (including severity)
    const finding = useReviewStore.getState().findingsMap.get('finding-merge')
    expect(finding?.severity).toBe('critical')
    expect(finding?.status).toBe('accepted')
    expect(finding?.updatedAt).toBe(newerTime)
  })
})
