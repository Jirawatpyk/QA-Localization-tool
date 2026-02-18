import { pgTable, uuid, varchar, real, integer, jsonb, timestamp } from 'drizzle-orm/pg-core'

import { files } from './files'
import { projects } from './projects'
import { tenants } from './tenants'

export const runMetadata = pgTable('run_metadata', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileId: uuid('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'restrict' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  modelVersions: jsonb('model_versions').notNull().$type<Record<string, string>>(),
  glossaryVersion: varchar('glossary_version', { length: 100 }).notNull(),
  ruleConfigHash: varchar('rule_config_hash', { length: 255 }).notNull(),
  processingMode: varchar('processing_mode', { length: 20 }).notNull(),
  totalCost: real('total_cost').notNull(),
  durationMs: integer('duration_ms').notNull(),
  layerCompleted: varchar('layer_completed', { length: 10 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
