import { pgTable, uuid, varchar, text, timestamp, unique } from 'drizzle-orm/pg-core'

import type { AssignmentStatus } from '@/types/assignment'

import { files } from './files'
import { findings } from './findings'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const findingAssignments = pgTable(
  'finding_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    findingId: uuid('finding_id')
      .notNull()
      .references(() => findings.id, { onDelete: 'cascade' }),
    // NOT NULL intentional: assignments only for per-file findings (findings.file_id can be nullable for cross-file findings)
    // TODO(story-5.2c): Server Action must guard — reject assignment if finding.fileId is null
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
    // Runtime validated against ASSIGNMENT_STATUSES (Guardrail #3, #72)
    // CHECK constraint added in Drizzle migration (Task 6)
    status: varchar('status', { length: 20 })
      .notNull()
      .default('pending')
      .$type<AssignmentStatus>(),
    flaggerComment: text('flagger_comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // TODO(story-5.2c): defaultNow() only at INSERT — add DB trigger or app-level set on UPDATE
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('uq_finding_assignments_finding_user').on(table.findingId, table.assignedTo)],
)
