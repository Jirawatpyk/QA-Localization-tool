import 'server-only'

import { eq, and } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { userRoles } from '@/db/schema/userRoles'
import type { AppRole } from '@/lib/auth/getCurrentUser'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'

type RequireRoleResult = {
  id: string
  email: string
  tenantId: string
  role: AppRole
}

/**
 * RBAC M3 pattern:
 * - For reads: check JWT claims (fast, ~1ms)
 * - For writes: query user_roles DB table (accurate, prevents stale JWT)
 *
 * Throws ActionResult-compatible error if unauthorized.
 */
export async function requireRole(
  requiredRole: AppRole,
  operation: 'read' | 'write' = 'read',
): Promise<RequireRoleResult> {
  const user = await getCurrentUser()

  if (!user) {
    throw { success: false, code: 'UNAUTHORIZED', error: 'Not authenticated' }
  }

  if (operation === 'read') {
    // Fast path: trust JWT claims for read operations
    if (!hasRequiredRole(user.role, requiredRole)) {
      throw { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
    }
    return user
  }

  // Write path: verify role from DB (M3 pattern — prevents stale JWT attacks)
  const [dbRole] = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, user.id), withTenant(userRoles.tenantId, user.tenantId)))
    .limit(1)

  if (!dbRole || !hasRequiredRole(dbRole.role as AppRole, requiredRole)) {
    throw { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
  }

  return { ...user, role: dbRole.role as AppRole }
}

/**
 * Role hierarchy: admin > qa_reviewer > native_reviewer
 * Admin can access everything, qa_reviewer can access reviewer features.
 */
function hasRequiredRole(userRole: AppRole, requiredRole: AppRole): boolean {
  const hierarchy: Record<AppRole, number> = {
    admin: 3,
    qa_reviewer: 2,
    native_reviewer: 1,
  }
  return hierarchy[userRole] >= hierarchy[requiredRole]
}
