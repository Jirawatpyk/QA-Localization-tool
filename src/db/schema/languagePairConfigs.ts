import { pgTable, uuid, varchar, integer, jsonb, timestamp } from 'drizzle-orm/pg-core'

import { tenants } from './tenants'

export const languagePairConfigs = pgTable('language_pair_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  sourceLang: varchar('source_lang', { length: 35 }).notNull(),
  targetLang: varchar('target_lang', { length: 35 }).notNull(),
  autoPassThreshold: integer('auto_pass_threshold').notNull(),
  l2ConfidenceMin: integer('l2_confidence_min').notNull(),
  l3ConfidenceMin: integer('l3_confidence_min').notNull(),
  mutedCategories: jsonb('muted_categories').$type<string[]>(),
  wordSegmenter: varchar('word_segmenter', { length: 20 }).notNull().default('intl'), // 'intl' | 'space'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
