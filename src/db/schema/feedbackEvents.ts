import { pgTable, uuid, varchar, text, real, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core'

import { files } from './files'
import { findings } from './findings'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const feedbackEvents = pgTable('feedback_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  findingId: uuid('finding_id').references(() => findings.id, { onDelete: 'set null' }), // preserve training data
  fileId: uuid('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'restrict' }),
  reviewerId: uuid('reviewer_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  action: varchar('action', { length: 30 }).notNull(),
  // 'accept' | 'reject' | 'edit' | 'change_severity' | 'flag' | 'note' | 'source_issue'
  findingCategory: varchar('finding_category', { length: 100 }).notNull(),
  originalSeverity: varchar('original_severity', { length: 20 }).notNull(),
  newSeverity: varchar('new_severity', { length: 20 }),
  layer: varchar('layer', { length: 10 }).notNull(), // 'L1' | 'L2' | 'L3'
  isFalsePositive: boolean('is_false_positive').notNull(),
  reviewerIsNative: boolean('reviewer_is_native').notNull(),
  sourceLang: varchar('source_lang', { length: 35 }).notNull(),
  targetLang: varchar('target_lang', { length: 35 }).notNull(),
  sourceText: text('source_text').notNull(),
  originalTarget: text('original_target').notNull(),
  correctedTarget: text('corrected_target'),
  detectedByLayer: varchar('detected_by_layer', { length: 10 }).notNull(),
  aiModel: varchar('ai_model', { length: 100 }),
  aiConfidence: real('ai_confidence'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
