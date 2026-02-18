import { pgTable, uuid, varchar, real, timestamp } from 'drizzle-orm/pg-core'

import { tenants } from './tenants'

export const severityConfigs = pgTable('severity_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }), // null for system defaults
  severity: varchar('severity', { length: 20 }).notNull(), // 'critical' | 'major' | 'minor'
  penaltyWeight: real('penalty_weight').notNull(), // critical=25, major=5, minor=1
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
