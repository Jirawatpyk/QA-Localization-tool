import { pgTable, uuid, varchar, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core'

import { files } from './files'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const suppressionRules = pgTable('suppression_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'restrict' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  pattern: text('pattern').notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  scope: varchar('scope', { length: 20 }).notNull(), // 'file' | 'language_pair' | 'all'
  duration: varchar('duration', { length: 30 }).notNull().default('until_improved'), // 'session' | 'permanent' | 'until_improved'
  reason: text('reason').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  isActive: boolean('is_active').notNull().default(true),
  fileId: uuid('file_id').references(() => files.id, { onDelete: 'cascade' }), // nullable — only for file-scoped
  sourceLang: varchar('source_lang', { length: 35 }), // nullable — only for language_pair scope
  targetLang: varchar('target_lang', { length: 35 }), // nullable — only for language_pair scope
  matchCount: integer('match_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
