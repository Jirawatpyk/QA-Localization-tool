import { sql } from 'drizzle-orm'
import { index, pgTable, uniqueIndex, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core'

import type { FileAssignmentPriority, FileAssignmentStatus } from '@/types/assignment'

import { files } from './files'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const fileAssignments = pgTable(
  'file_assignments',
  {
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
    assignedTo: uuid('assigned_to')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 20 })
      .notNull()
      .default('assigned')
      .$type<FileAssignmentStatus>(),
    priority: varchar('priority', { length: 20 })
      .notNull()
      .default('normal')
      .$type<FileAssignmentPriority>(),
    notes: text('notes'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_file_assignments_active')
      .on(table.fileId, table.tenantId)
      .where(sql`status IN ('assigned', 'in_progress')`),
    index('idx_file_assignments_assigned_to_status').on(table.assignedTo, table.status),
    index('idx_file_assignments_file_tenant').on(table.fileId, table.tenantId),
  ],
)
