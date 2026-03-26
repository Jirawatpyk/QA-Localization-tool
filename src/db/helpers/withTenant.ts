import { type SQL, eq } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import type { TenantId } from '@/types/tenant'

/**
 * Type-safe tenant filter for any table with tenant_id column.
 * MUST be used on every query to enforce multi-tenancy isolation.
 * Requires branded TenantId — prevents accidental use of wrong ID types.
 *
 * @example
 * db.select().from(projects).where(and(withTenant(projects.tenantId, tenantId), otherCondition))
 */
export function withTenant(tenantIdColumn: PgColumn, tenantId: TenantId): SQL {
  return eq(tenantIdColumn, tenantId)
}
