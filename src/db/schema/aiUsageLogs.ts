import { pgTable, uuid, varchar, integer, real, timestamp } from 'drizzle-orm/pg-core'

import { files } from './files'
import { projects } from './projects'
import { tenants } from './tenants'

export const aiUsageLogs = pgTable('ai_usage_logs', {
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
  layer: varchar('layer', { length: 10 }).notNull(), // 'L1' | 'L2' | 'L3'
  model: varchar('model', { length: 100 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  estimatedCost: real('estimated_cost').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  status: varchar('status', { length: 30 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
