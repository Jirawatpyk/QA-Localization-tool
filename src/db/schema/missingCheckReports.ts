import { integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const missingCheckReports = pgTable('missing_check_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  fileReference: text('file_reference').notNull(),
  segmentNumber: integer('segment_number').notNull(),
  expectedDescription: text('expected_description').notNull(),
  xbenchCheckType: text('xbench_check_type').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('open'),
  // status: 'open' | 'investigating' | 'resolved' | 'wont_fix'
  trackingReference: text('tracking_reference').notNull().unique(),
  reportedBy: uuid('reported_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
