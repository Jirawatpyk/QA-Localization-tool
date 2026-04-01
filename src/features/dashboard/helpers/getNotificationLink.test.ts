import { describe, it, expect } from 'vitest'

import type { AppNotification } from '@/features/dashboard/types'
import type { NotificationType } from '@/lib/notifications/types'

import { getNotificationLink } from './getNotificationLink'

function makeNotif(
  type: NotificationType,
  metadata: Record<string, unknown> | null = null,
): AppNotification {
  return {
    id: 'n-1',
    tenantId: 't-1',
    userId: 'u-1',
    type,
    title: 'Test',
    body: 'Test body',
    isRead: false,
    metadata,
    createdAt: '2026-04-01T00:00:00Z',
  }
}

describe('getNotificationLink', () => {
  // ── File-level routes ──

  it.each([
    'analysis_complete',
    'file_assigned',
    'file_reassigned',
    'file_urgent',
    'assignment_completed',
    'auto_pass_triggered',
  ] as NotificationType[])('should return /projects/{pid}/review/{fid} for %s', (type) => {
    const notif = makeNotif(type, { projectId: 'p1', fileId: 'f1' })
    expect(getNotificationLink(notif)).toBe('/projects/p1/review/f1')
  })

  // ── Finding-level routes ──

  it.each(['finding_flagged_for_native', 'native_review_completed'] as NotificationType[])(
    'should return /projects/{pid}/review/{fid}?findingId={findingId} for %s',
    (type) => {
      const notif = makeNotif(type, { projectId: 'p1', fileId: 'f1', findingId: 'find-1' })
      expect(getNotificationLink(notif)).toBe('/projects/p1/review/f1?findingId=find-1')
    },
  )

  it.each(['finding_flagged_for_native', 'native_review_completed'] as NotificationType[])(
    'should return file-level route for %s when findingId is missing',
    (type) => {
      const notif = makeNotif(type, { projectId: 'p1', fileId: 'f1' })
      expect(getNotificationLink(notif)).toBe('/projects/p1/review/f1')
    },
  )

  // ── native_comment_added (lacks projectId/fileId in metadata) ──

  it('should return null for native_comment_added when projectId/fileId missing', () => {
    const notif = makeNotif('native_comment_added', { assignmentId: 'a1', commentId: 'c1' })
    expect(getNotificationLink(notif)).toBeNull()
  })

  it('should return route for native_comment_added when projectId and fileId provided', () => {
    const notif = makeNotif('native_comment_added', {
      projectId: 'p1',
      fileId: 'f1',
      findingId: 'find-1',
    })
    expect(getNotificationLink(notif)).toBe('/projects/p1/review/f1?findingId=find-1')
  })

  // ── Glossary route ──

  it('should return /projects/{pid}/glossary for glossary_updated', () => {
    const notif = makeNotif('glossary_updated', { projectId: 'p1' })
    expect(getNotificationLink(notif)).toBe('/projects/p1/glossary')
  })

  // ── Settings route ──

  it('should return /projects/{pid}/settings for language_pair_graduated', () => {
    const notif = makeNotif('language_pair_graduated', {
      projectId: 'p1',
      sourceLang: 'en',
      targetLang: 'th',
    })
    expect(getNotificationLink(notif)).toBe('/projects/p1/settings')
  })

  // ── Null fallback cases ──

  it('should return null when metadata is null', () => {
    const notif = makeNotif('file_assigned', null)
    expect(getNotificationLink(notif)).toBeNull()
  })

  it('should return null when projectId is missing from metadata', () => {
    const notif = makeNotif('file_assigned', { fileId: 'f1' })
    expect(getNotificationLink(notif)).toBeNull()
  })

  it('should return null when fileId is missing for file-level types', () => {
    const notif = makeNotif('file_assigned', { projectId: 'p1' })
    expect(getNotificationLink(notif)).toBeNull()
  })

  it('should return null for glossary_updated when projectId is missing', () => {
    const notif = makeNotif('glossary_updated', {})
    expect(getNotificationLink(notif)).toBeNull()
  })

  it('should return null for language_pair_graduated when projectId is missing', () => {
    const notif = makeNotif('language_pair_graduated', { sourceLang: 'en' })
    expect(getNotificationLink(notif)).toBeNull()
  })
})
