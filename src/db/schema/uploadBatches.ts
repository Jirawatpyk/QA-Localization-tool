import { pgTable, uuid, integer, timestamp } from 'drizzle-orm/pg-core'

import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const uploadBatches = pgTable('upload_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  fileCount: integer('file_count').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
