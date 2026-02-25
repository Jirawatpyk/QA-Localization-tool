'use server'
import 'server-only'

import { eq, and } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { users } from '@/db/schema/users'
import type { UserMetadata } from '@/features/onboarding/types'
import { updateTourStateSchema } from '@/features/onboarding/validation/onboardingSchemas'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import type { ActionResult } from '@/types/actionResult'

export async function updateTourState(input: unknown): Promise<ActionResult<{ success: true }>> {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return { success: false, code: 'UNAUTHORIZED', error: 'Not authenticated' }
  }

  const parsed = updateTourStateSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { action, tourId, dismissedAtStep } = parsed.data
  const existingMetadata: UserMetadata = currentUser.metadata ?? {}
  const newMetadata: UserMetadata = { ...existingMetadata }

  const tourCompletedKey = `${tourId}_tour_completed` as keyof Pick<
    UserMetadata,
    'setup_tour_completed' | 'review_tour_completed' | 'project_tour_completed'
  >

  if (action === 'complete') {
    newMetadata[tourCompletedKey] = new Date().toISOString()
    // Clear dismissed_at_step for this tour
    if (newMetadata.dismissed_at_step) {
      newMetadata.dismissed_at_step = {
        ...newMetadata.dismissed_at_step,
        [tourId]: null,
      }
    }
  } else if (action === 'dismiss') {
    newMetadata.dismissed_at_step = {
      ...newMetadata.dismissed_at_step,
      [tourId]: dismissedAtStep,
    }
  } else if (action === 'restart') {
    newMetadata[tourCompletedKey] = null
    if (newMetadata.dismissed_at_step) {
      newMetadata.dismissed_at_step = {
        ...newMetadata.dismissed_at_step,
        [tourId]: null,
      }
    }
  }

  try {
    const rows = await db
      .update(users)
      .set({ metadata: newMetadata })
      .where(and(eq(users.id, currentUser.id), withTenant(users.tenantId, currentUser.tenantId)))
      .returning({ id: users.id })

    if (rows.length === 0) {
      return { success: false, code: 'NOT_FOUND', error: 'User not found' }
    }
  } catch {
    return { success: false, code: 'DB_ERROR', error: 'Failed to update tour state' }
  }

  // No audit log — tour state is user preference, not business-critical (per story spec)

  return { success: true, data: { success: true } }
}
