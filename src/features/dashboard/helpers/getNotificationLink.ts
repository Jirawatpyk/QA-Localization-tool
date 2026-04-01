import type { AppNotification } from '@/features/dashboard/types'

/**
 * Maps a notification to its navigation route.
 * Returns `null` when required metadata IDs are missing.
 *
 * `projectId` is preferred from the top-level column, with metadata as fallback.
 * `fileId`/`findingId` come from metadata only.
 *
 * WARNING: `native_comment_added` lacks both `projectId` and `fileId` in metadata.
 * It only has `assignmentId` — returns `null` until we have a lookup mechanism.
 */
export function getNotificationLink(notif: AppNotification): string | null {
  const projectId = notif.projectId ?? (notif.metadata?.projectId as string | undefined)
  const fileId = notif.metadata?.fileId as string | undefined
  const findingId = notif.metadata?.findingId as string | undefined

  switch (notif.type) {
    // File-level routes (need projectId + fileId)
    case 'analysis_complete':
    case 'file_assigned':
    case 'file_reassigned':
    case 'file_urgent':
    case 'assignment_completed':
    case 'auto_pass_triggered': {
      if (!projectId || !fileId) return null
      return `/projects/${projectId}/review/${fileId}`
    }

    // Finding-level routes (need projectId + fileId, optionally findingId)
    // Note: native_comment_added lacks projectId/fileId in metadata — will return
    // null unless projectId comes from the column. Lookup by assignmentId deferred.
    case 'finding_flagged_for_native':
    case 'native_review_completed':
    case 'native_comment_added': {
      if (!projectId || !fileId) return null
      if (!findingId) return `/projects/${projectId}/review/${fileId}`
      return `/projects/${projectId}/review/${fileId}?findingId=${findingId}`
    }

    // Glossary route
    case 'glossary_updated': {
      if (!projectId) return null
      return `/projects/${projectId}/glossary`
    }

    // Settings route
    case 'language_pair_graduated': {
      if (!projectId) return null
      return `/projects/${projectId}/settings`
    }

    default:
      return null
  }
}
