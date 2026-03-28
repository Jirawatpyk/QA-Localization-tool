'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { userRoles } from '@/db/schema/userRoles'
import { users } from '@/db/schema/users'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

type NativeReviewer = {
  id: string
  displayName: string
  nativeLanguages: string[]
}

/**
 * List eligible native reviewers for the FlagForNativeDialog dropdown.
 * Queries users with `role = 'native_reviewer'` within the same tenant.
 */
export async function getNativeReviewers(): Promise<ActionResult<NativeReviewer[]>> {
  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('qa_reviewer')
  } catch {
    return { success: false, error: 'Unauthorized', code: 'AUTH_ERROR' }
  }

  const { tenantId } = user

  const reviewers = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      nativeLanguages: users.nativeLanguages,
    })
    .from(users)
    .innerJoin(
      userRoles,
      and(
        eq(userRoles.userId, users.id),
        eq(userRoles.role, 'native_reviewer'),
        withTenant(userRoles.tenantId, tenantId),
      ),
    )
    .where(withTenant(users.tenantId, tenantId))

  return {
    success: true,
    data: reviewers.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      nativeLanguages: (r.nativeLanguages ?? []) as string[],
    })),
  }
}
