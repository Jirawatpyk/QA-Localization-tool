import { type SQL, eq } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

/**
 * Type-safe tenant filter for any table with tenant_id column.
 * MUST be used on every query to enforce multi-tenancy isolation.
 *
 * @example
 * db.select().from(projects).where(and(withTenant(projects.tenantId, tenantId), otherCondition))
 */
export function withTenant(tenantIdColumn: PgColumn, tenantId: string): SQL {
  return eq(tenantIdColumn, tenantId)
}
