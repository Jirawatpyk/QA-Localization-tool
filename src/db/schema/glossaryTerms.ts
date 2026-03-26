import { pgTable, uuid, varchar, boolean, text, timestamp } from 'drizzle-orm/pg-core'

import { glossaries } from './glossaries'
import { tenants } from './tenants'

export const glossaryTerms = pgTable('glossary_terms', {
  id: uuid('id').primaryKey().defaultRandom(),
  glossaryId: uuid('glossary_id')
    .notNull()
    .references(() => glossaries.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  sourceTerm: varchar('source_term', { length: 500 }).notNull(),
  targetTerm: varchar('target_term', { length: 500 }).notNull(),
  caseSensitive: boolean('case_sensitive').notNull().default(false),
  notes: text('notes'), // TD-GLOSSARY-001: nullable reviewer notes
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
