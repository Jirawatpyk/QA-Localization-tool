import { pgTable, uuid, varchar, timestamp, unique } from 'drizzle-orm/pg-core'

import { tenants } from './tenants'
import { users } from './users'

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    role: varchar('role', { length: 50 }).notNull(), // 'admin' | 'qa_reviewer' | 'native_reviewer'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('uq_user_roles_user_tenant').on(table.userId, table.tenantId)],
)
