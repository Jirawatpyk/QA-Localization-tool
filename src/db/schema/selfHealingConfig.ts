import { pgTable, uuid, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core'

import { projects } from './projects'
import { tenants } from './tenants'

// Growth-phase table — mode='disabled' at zero runtime cost
export const selfHealingConfig = pgTable('self_healing_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  config: jsonb('config').notNull().$type<Record<string, unknown>>(),
  mode: varchar('mode', { length: 20 }).notNull().default('disabled'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
