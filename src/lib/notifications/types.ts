// ── Notification Type Constants ──
// Shared between server (createNotification) and client (useNotifications)
// NO server-only imports — safe for client components

// Existing types (migrated from inline INSERTs)
export const NOTIFICATION_TYPES = {
  // Epic 5: Native review workflow
  FINDING_FLAGGED_FOR_NATIVE: 'finding_flagged_for_native',
  NATIVE_REVIEW_COMPLETED: 'native_review_completed',
  NATIVE_COMMENT_ADDED: 'native_comment_added',
  // Epic 2: Score graduation
  LANGUAGE_PAIR_GRADUATED: 'language_pair_graduated',
  // Epic 6: File assignment (Story 6.1)
  FILE_ASSIGNED: 'file_assigned',
  FILE_REASSIGNED: 'file_reassigned',
  FILE_URGENT: 'file_urgent',
  ASSIGNMENT_COMPLETED: 'assignment_completed',
  // Epic 6: Event notifications (Story 6.2a)
  ANALYSIS_COMPLETE: 'analysis_complete',
  GLOSSARY_UPDATED: 'glossary_updated',
  AUTO_PASS_TRIGGERED: 'auto_pass_triggered',
} as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES]

/** Pre-computed values array for Zod enum validation — shared across action + hook */
export const NOTIFICATION_TYPE_VALUES = Object.values(NOTIFICATION_TYPES) as [
  NotificationType,
  ...NotificationType[],
]

/** Set for O(1) runtime type validation */
export const NOTIFICATION_TYPE_SET: ReadonlySet<string> = new Set(Object.values(NOTIFICATION_TYPES))
