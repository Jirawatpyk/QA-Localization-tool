'use server'

import 'server-only'

import { executeUndoRedo } from '@/features/review/actions/helpers/executeUndoRedo'
import type { UndoRedoResult } from '@/features/review/actions/helpers/executeUndoRedo'
import { redoActionSchema } from '@/features/review/validation/undoAction.schema'
import type { RedoActionInput } from '@/features/review/validation/undoAction.schema'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

export async function redoAction(input: RedoActionInput): Promise<ActionResult<UndoRedoResult>> {
  // Zod validation
  const parsed = redoActionSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      code: 'VALIDATION_ERROR',
    }
  }

  // Auth
  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('qa_reviewer')
  } catch {
    return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }
  }

  const { findingId, fileId, projectId, targetState, expectedCurrentState } = parsed.data

  return executeUndoRedo({
    findingId,
    fileId,
    projectId,
    targetState,
    expectedCurrentState,
    force: false,
    actionType: 'redo',
    user: { id: user.id, tenantId: user.tenantId, nativeLanguages: user.nativeLanguages },
  })
}
