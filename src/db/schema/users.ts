import { pgTable, uuid, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core'

import { tenants } from './tenants'

export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // references Supabase Auth UID — no defaultRandom
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  email: varchar('email', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  nativeLanguages: jsonb('native_languages').$type<string[]>(), // BCP-47 array
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
