import { pgTable, uuid, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core'

import { tenants } from './tenants'
import { users } from './users'

// NOTE: Actual CREATE TABLE is overridden in supabase/migrations/00004_audit_logs_partitioning.sql
// with PARTITION BY RANGE (created_at). PK is composite (id, created_at) added there.
// This schema is for Drizzle type inference only — intentionally missing .primaryKey().
// IMMUTABLE: INSERT only at app level (3-layer defense: app, RLS, trigger)
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }), // null for system events
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  oldValue: jsonb('old_value').$type<Record<string, unknown>>(),
  newValue: jsonb('new_value').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
