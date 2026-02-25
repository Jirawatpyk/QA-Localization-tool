import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { files } from './files'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const parityReports = pgTable('parity_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
  toolFindingCount: integer('tool_finding_count').notNull().default(0),
  xbenchFindingCount: integer('xbench_finding_count').notNull().default(0),
  bothFoundCount: integer('both_found_count').notNull().default(0),
  toolOnlyCount: integer('tool_only_count').notNull().default(0),
  xbenchOnlyCount: integer('xbench_only_count').notNull().default(0),
  comparisonData: jsonb('comparison_data').notNull(),
  xbenchReportStoragePath: text('xbench_report_storage_path').notNull(),
  generatedBy: uuid('generated_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
