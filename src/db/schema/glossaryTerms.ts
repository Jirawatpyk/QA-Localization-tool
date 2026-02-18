import { pgTable, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core'

import { glossaries } from './glossaries'

export const glossaryTerms = pgTable('glossary_terms', {
  id: uuid('id').primaryKey().defaultRandom(),
  glossaryId: uuid('glossary_id')
    .notNull()
    .references(() => glossaries.id, { onDelete: 'cascade' }),
  sourceTerm: varchar('source_term', { length: 500 }).notNull(),
  targetTerm: varchar('target_term', { length: 500 }).notNull(),
  caseSensitive: boolean('case_sensitive').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
