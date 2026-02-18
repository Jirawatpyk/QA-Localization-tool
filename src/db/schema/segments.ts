import { pgTable, uuid, varchar, text, integer, timestamp } from 'drizzle-orm/pg-core'

import { files } from './files'
import { projects } from './projects'
import { tenants } from './tenants'

export const segments = pgTable('segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileId: uuid('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  segmentNumber: integer('segment_number').notNull(),
  sourceText: text('source_text').notNull(),
  targetText: text('target_text').notNull(),
  sourceLang: varchar('source_lang', { length: 35 }).notNull(),
  targetLang: varchar('target_lang', { length: 35 }).notNull(),
  wordCount: integer('word_count').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
