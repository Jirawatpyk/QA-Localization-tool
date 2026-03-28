import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

import { findingAssignments } from './findingAssignments'
import { findings } from './findings'
import { tenants } from './tenants'
import { users } from './users'

// Comments are immutable for audit trail integrity (RLS design doc N3)
// NO updatedAt column — NO UPDATE RLS policy
export const findingComments = pgTable('finding_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  findingId: uuid('finding_id')
    .notNull()
    .references(() => findings.id, { onDelete: 'cascade' }),
  findingAssignmentId: uuid('finding_assignment_id')
    .notNull()
    .references(() => findingAssignments.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
