import type { ActionErrorCode } from '@/types/actionErrorCode'

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: ActionErrorCode }
