import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core'

import { projects } from './projects'
import { tenants } from './tenants'

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  fileName: varchar('file_name', { length: 500 }).notNull(),
  fileType: varchar('file_type', { length: 20 }).notNull(), // 'sdlxliff' | 'xliff' | 'xlsx'
  fileSizeBytes: integer('file_size_bytes').notNull(),
  storagePath: varchar('storage_path', { length: 1000 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('uploaded'), // 'uploaded' | 'parsing' | 'parsed' | 'error'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
