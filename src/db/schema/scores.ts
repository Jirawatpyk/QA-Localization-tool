import { pgTable, uuid, varchar, real, integer, text, timestamp } from 'drizzle-orm/pg-core'

import { files } from './files'
import { projects } from './projects'
import { tenants } from './tenants'

export const scores = pgTable('scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileId: uuid('file_id').references(() => files.id, { onDelete: 'cascade' }), // null for project-level aggregate
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  mqmScore: real('mqm_score').notNull(), // 0-100
  totalWords: integer('total_words').notNull(),
  criticalCount: integer('critical_count').notNull(),
  majorCount: integer('major_count').notNull(),
  minorCount: integer('minor_count').notNull(),
  npt: real('npt').notNull(), // Normalized Penalty Total
  layerCompleted: varchar('layer_completed', { length: 10 }).notNull(), // 'L1' | 'L1L2' | 'L1L2L3'
  status: varchar('status', { length: 20 }).notNull().default('calculating'),
  // 'calculating' | 'calculated' | 'partial' | 'overridden' | 'auto_passed' | 'na'
  autoPassRationale: text('auto_pass_rationale'),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
