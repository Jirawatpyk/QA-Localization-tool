import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core'

import { projects } from './projects'
import { tenants } from './tenants'
import { uploadBatches } from './uploadBatches'
import { users } from './users'

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
  fileHash: varchar('file_hash', { length: 64 }), // SHA-256 hex, nullable for legacy rows
  storagePath: varchar('storage_path', { length: 1000 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('uploaded'), // 'uploaded' | 'parsing' | 'parsed' | 'l1_processing' | 'l1_completed' | 'failed'
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  batchId: uuid('batch_id').references(() => uploadBatches.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
