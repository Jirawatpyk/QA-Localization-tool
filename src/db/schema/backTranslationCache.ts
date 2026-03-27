import {
  pgTable,
  uuid,
  varchar,
  text,
  real,
  integer,
  timestamp,
  jsonb,
  unique,
  index,
} from 'drizzle-orm/pg-core'

import type { LanguageNote } from '@/features/bridge/types'

import { segments } from './segments'
import { tenants } from './tenants'

export const backTranslationCache = pgTable(
  'back_translation_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    segmentId: uuid('segment_id')
      .notNull()
      .references(() => segments.id, { onDelete: 'cascade' }), // Guardrail #60: CASCADE invalidation on re-upload
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    languagePair: varchar('language_pair', { length: 50 }).notNull(), // e.g. "en-US→th-TH"
    modelVersion: varchar('model_version', { length: 100 }).notNull(),
    targetTextHash: varchar('target_text_hash', { length: 64 }).notNull(), // SHA-256 hex (Guardrail #57)
    backTranslation: text('back_translation').notNull(),
    contextualExplanation: text('contextual_explanation').notNull(),
    confidence: real('confidence').notNull(), // 0.0–1.0
    languageNotes: jsonb('language_notes').notNull().$type<LanguageNote[]>(),
    translationApproach: text('translation_approach'), // nullable
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    estimatedCostUsd: real('estimated_cost_usd').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Subtask 2.2: Unique constraint — cache key
    unique('uq_bt_cache_segment_lang_model_hash').on(
      table.segmentId,
      table.languagePair,
      table.modelVersion,
      table.targetTextHash,
    ),
    // Subtask 2.3: Indexes
    index('idx_bt_cache_lookup').on(table.segmentId, table.languagePair, table.modelVersion),
    index('idx_bt_cache_ttl_cleanup').on(table.createdAt),
  ],
)
