import { pgTable, uuid, varchar, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core'

import { files } from './files'
import { projects } from './projects'
import { tenants } from './tenants'

// Inline tag extracted from XLIFF/SDLXLIFF source or target text.
// NOTE: Keep in sync with InlineTag + InlineTagsData in @/features/parser/types.ts.
// Cannot import from features here — db schema must not depend on feature modules.
type InlineTag = {
  type: 'g' | 'x' | 'ph' | 'bx' | 'ex' | 'bpt' | 'ept'
  id: string
  position: number
  attributes?: Record<string, string>
  content?: string
}

// Source and target tags stored separately for tag integrity comparison (Story 2.4)
type InlineTagsData = {
  source: InlineTag[]
  target: InlineTag[]
}

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
  // Story 2.2: SDLXLIFF/XLIFF metadata columns
  confirmationState: varchar('confirmation_state', { length: 30 }),
  matchPercentage: integer('match_percentage'),
  translatorComment: text('translator_comment'),
  inlineTags: jsonb('inline_tags').$type<InlineTagsData>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
