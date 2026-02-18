import { pgTable, uuid, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core'

import { files } from './files'
import { findings } from './findings'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const reviewActions = pgTable('review_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  findingId: uuid('finding_id')
    .notNull()
    .references(() => findings.id, { onDelete: 'restrict' }),
  fileId: uuid('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'restrict' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  actionType: varchar('action_type', { length: 50 }).notNull(),
  previousState: varchar('previous_state', { length: 50 }).notNull(),
  newState: varchar('new_state', { length: 50 }).notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  batchId: uuid('batch_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
