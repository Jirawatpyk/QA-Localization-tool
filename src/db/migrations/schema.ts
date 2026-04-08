import { sql } from 'drizzle-orm'
import {
  pgTable,
  index,
  foreignKey,
  unique,
  pgPolicy,
  uuid,
  varchar,
  text,
  real,
  jsonb,
  integer,
  timestamp,
  check,
  serial,
  bigint,
  numeric,
  boolean,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core'

export const backTranslationCache = pgTable(
  'back_translation_cache',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    segmentId: uuid('segment_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    languagePair: varchar('language_pair', { length: 50 }).notNull(),
    modelVersion: varchar('model_version', { length: 100 }).notNull(),
    targetTextHash: varchar('target_text_hash', { length: 64 }).notNull(),
    backTranslation: text('back_translation').notNull(),
    contextualExplanation: text('contextual_explanation').notNull(),
    confidence: real().notNull(),
    languageNotes: jsonb('language_notes').notNull(),
    translationApproach: text('translation_approach'),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    estimatedCostUsd: real('estimated_cost_usd').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_bt_cache_lookup').using(
      'btree',
      table.segmentId.asc().nullsLast().op('uuid_ops'),
      table.languagePair.asc().nullsLast().op('text_ops'),
      table.modelVersion.asc().nullsLast().op('text_ops'),
    ),
    index('idx_bt_cache_ttl_cleanup').using(
      'btree',
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.segmentId],
      foreignColumns: [segments.id],
      name: 'back_translation_cache_segment_id_segments_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'back_translation_cache_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    unique('uq_bt_cache_segment_lang_model_hash').on(
      table.segmentId,
      table.languagePair,
      table.modelVersion,
      table.targetTextHash,
    ),
    pgPolicy('Tenant isolation: DELETE', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    pgPolicy('service_role: cleanup expired', {
      as: 'permissive',
      for: 'delete',
      to: ['service_role'],
    }),
  ],
)

export const findingAssignments = pgTable(
  'finding_assignments',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    findingId: uuid('finding_id').notNull(),
    fileId: uuid('file_id').notNull(),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    assignedTo: uuid('assigned_to').notNull(),
    assignedBy: uuid('assigned_by').notNull(),
    status: varchar({ length: 20 }).default('pending').notNull(),
    flaggerComment: text('flagger_comment'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_finding_assignments_finding_user').using(
      'btree',
      table.findingId.asc().nullsLast().op('uuid_ops'),
      table.assignedTo.asc().nullsLast().op('uuid_ops'),
    ),
    index('idx_finding_assignments_user_tenant').using(
      'btree',
      table.assignedTo.asc().nullsLast().op('uuid_ops'),
      table.tenantId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.findingId],
      foreignColumns: [findings.id],
      name: 'finding_assignments_finding_id_findings_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.fileId],
      foreignColumns: [files.id],
      name: 'finding_assignments_file_id_files_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'finding_assignments_project_id_projects_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'finding_assignments_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.assignedTo],
      foreignColumns: [users.id],
      name: 'finding_assignments_assigned_to_users_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.assignedBy],
      foreignColumns: [users.id],
      name: 'finding_assignments_assigned_by_users_id_fk',
    }).onDelete('restrict'),
    unique('uq_finding_assignments_finding_user').on(table.findingId, table.assignedTo),
    pgPolicy('finding_assignments_delete_admin', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`((tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid) AND ((( SELECT auth.jwt() AS jwt) ->> 'user_role'::text) = 'admin'::text))`,
    }),
    pgPolicy('finding_assignments_insert_admin_qa', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('finding_assignments_select_admin_qa', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('finding_assignments_select_native', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('finding_assignments_update_admin_qa', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    pgPolicy('finding_assignments_update_native', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    check(
      'chk_finding_assignments_status',
      sql`(status)::text = ANY ((ARRAY['pending'::character varying, 'in_review'::character varying, 'confirmed'::character varying, 'overridden'::character varying])::text[])`,
    ),
  ],
)

export const findingComments = pgTable(
  'finding_comments',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    findingId: uuid('finding_id').notNull(),
    findingAssignmentId: uuid('finding_assignment_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    authorId: uuid('author_id').notNull(),
    body: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_finding_comments_assignment').using(
      'btree',
      table.findingAssignmentId.asc().nullsLast().op('uuid_ops'),
    ),
    index('idx_finding_comments_finding').using(
      'btree',
      table.findingId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.findingId],
      foreignColumns: [findings.id],
      name: 'finding_comments_finding_id_findings_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.findingAssignmentId],
      foreignColumns: [findingAssignments.id],
      name: 'finding_comments_finding_assignment_id_finding_assignments_id_f',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'finding_comments_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.authorId],
      foreignColumns: [users.id],
      name: 'finding_comments_author_id_users_id_fk',
    }).onDelete('restrict'),
    pgPolicy('finding_comments_delete', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`((tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid) AND ((( SELECT auth.jwt() AS jwt) ->> 'user_role'::text) = 'admin'::text))`,
    }),
    pgPolicy('finding_comments_insert_admin_qa', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('finding_comments_insert_native', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('finding_comments_select_admin_qa', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('finding_comments_select_native', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    check('chk_finding_comments_body_not_empty', sql`char_length(body) > 0`),
  ],
)

export const drizzleMigrations = pgTable('__drizzle_migrations', {
  id: serial().primaryKey().notNull(),
  hash: text().notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  createdAt: bigint('created_at', { mode: 'number' }),
})

export const parityReports = pgTable(
  'parity_reports',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    fileId: uuid('file_id'),
    toolFindingCount: integer('tool_finding_count').default(0).notNull(),
    xbenchFindingCount: integer('xbench_finding_count').default(0).notNull(),
    bothFoundCount: integer('both_found_count').default(0).notNull(),
    toolOnlyCount: integer('tool_only_count').default(0).notNull(),
    xbenchOnlyCount: integer('xbench_only_count').default(0).notNull(),
    comparisonData: jsonb('comparison_data').notNull(),
    xbenchReportStoragePath: text('xbench_report_storage_path').notNull(),
    generatedBy: uuid('generated_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_parity_reports_project').using(
      'btree',
      table.projectId.asc().nullsLast().op('uuid_ops'),
    ),
    index('idx_parity_reports_tenant').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'parity_reports_project_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'parity_reports_tenant_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.fileId],
      foreignColumns: [files.id],
      name: 'parity_reports_file_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.generatedBy],
      foreignColumns: [users.id],
      name: 'parity_reports_generated_by_fkey',
    }).onDelete('restrict'),
    pgPolicy('Tenant isolation: DELETE', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const missingCheckReports = pgTable(
  'missing_check_reports',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    fileReference: text('file_reference').notNull(),
    segmentNumber: integer('segment_number').notNull(),
    expectedDescription: text('expected_description').notNull(),
    xbenchCheckType: text('xbench_check_type').notNull(),
    status: varchar({ length: 20 }).default('open').notNull(),
    trackingReference: text('tracking_reference').notNull(),
    reportedBy: uuid('reported_by').notNull(),
    resolvedBy: uuid('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_missing_check_reports_project').using(
      'btree',
      table.projectId.asc().nullsLast().op('uuid_ops'),
    ),
    index('idx_missing_check_reports_tenant').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops'),
    ),
    index('idx_missing_check_reports_tracking').using(
      'btree',
      table.trackingReference.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'missing_check_reports_project_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'missing_check_reports_tenant_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.reportedBy],
      foreignColumns: [users.id],
      name: 'missing_check_reports_reported_by_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.resolvedBy],
      foreignColumns: [users.id],
      name: 'missing_check_reports_resolved_by_fkey',
    }).onDelete('set null'),
    unique('missing_check_reports_tracking_reference_key').on(table.trackingReference),
    pgPolicy('Tenant isolation: DELETE', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const projects = pgTable(
  'projects',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    name: varchar({ length: 255 }).notNull(),
    description: text(),
    sourceLang: varchar('source_lang', { length: 35 }).notNull(),
    targetLangs: jsonb('target_langs').notNull(),
    processingMode: varchar('processing_mode', { length: 20 }).default('economy').notNull(),
    status: varchar({ length: 20 }).default('draft').notNull(),
    autoPassThreshold: integer('auto_pass_threshold').default(95).notNull(),
    aiBudgetMonthlyUsd: numeric('ai_budget_monthly_usd', { precision: 10, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    l2PinnedModel: varchar('l2_pinned_model', { length: 100 }),
    l3PinnedModel: varchar('l3_pinned_model', { length: 100 }),
    budgetAlertThresholdPct: integer('budget_alert_threshold_pct').default(80).notNull(),
    btConfidenceThreshold: real('bt_confidence_threshold').default(0.6).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'projects_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    pgPolicy('Tenant isolation: DELETE', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const tenants = pgTable(
  'tenants',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    status: varchar({ length: 50 }).default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (_table) => [
    pgPolicy('Tenant isolation: DELETE', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    email: varchar({ length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    nativeLanguages: jsonb('native_languages'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'users_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    pgPolicy('Tenant isolation: DELETE', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const scores = pgTable(
  'scores',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    fileId: uuid('file_id'),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    mqmScore: real('mqm_score').notNull(),
    totalWords: integer('total_words').notNull(),
    criticalCount: integer('critical_count').notNull(),
    majorCount: integer('major_count').notNull(),
    minorCount: integer('minor_count').notNull(),
    npt: real().notNull(),
    layerCompleted: varchar('layer_completed', { length: 10 }).notNull(),
    status: varchar({ length: 20 }).default('calculating').notNull(),
    autoPassRationale: text('auto_pass_rationale'),
    calculatedAt: timestamp('calculated_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_scores_project').using('btree', table.projectId.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.fileId],
      foreignColumns: [files.id],
      name: 'scores_file_id_files_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'scores_project_id_projects_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'scores_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    unique('uq_scores_file_tenant').on(table.fileId, table.tenantId),
    pgPolicy('Tenant isolation: DELETE', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const reviewSessions = pgTable(
  'review_sessions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    reviewerId: uuid('reviewer_id').notNull(),
    status: varchar({ length: 20 }).default('in_progress').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'review_sessions_project_id_projects_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'review_sessions_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.reviewerId],
      foreignColumns: [users.id],
      name: 'review_sessions_reviewer_id_users_id_fk',
    }).onDelete('restrict'),
    pgPolicy('Tenant isolation: DELETE', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const reviewActions = pgTable(
  'review_actions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    findingId: uuid('finding_id').notNull(),
    fileId: uuid('file_id').notNull(),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    actionType: varchar('action_type', { length: 50 }).notNull(),
    previousState: varchar('previous_state', { length: 50 }).notNull(),
    newState: varchar('new_state', { length: 50 }).notNull(),
    userId: uuid('user_id').notNull(),
    batchId: uuid('batch_id'),
    metadata: jsonb(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.findingId],
      foreignColumns: [findings.id],
      name: 'review_actions_finding_id_findings_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.fileId],
      foreignColumns: [files.id],
      name: 'review_actions_file_id_files_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'review_actions_project_id_projects_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'review_actions_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'review_actions_user_id_users_id_fk',
    }).onDelete('restrict'),
    pgPolicy('review_actions_delete_admin', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`((tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid) AND ((( SELECT auth.jwt() AS jwt) ->> 'user_role'::text) = 'admin'::text))`,
    }),
    pgPolicy('review_actions_insert_admin_qa', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('review_actions_insert_native', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('review_actions_select_admin_qa', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('review_actions_select_native', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('review_actions_update_admin_qa', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const glossaries = pgTable(
  'glossaries',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    projectId: uuid('project_id'),
    name: varchar({ length: 255 }).notNull(),
    sourceLang: varchar('source_lang', { length: 35 }).notNull(),
    targetLang: varchar('target_lang', { length: 35 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'glossaries_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'glossaries_project_id_projects_id_fk',
    }).onDelete('set null'),
    pgPolicy('Tenant isolation: DELETE', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const languagePairConfigs = pgTable(
  'language_pair_configs',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    sourceLang: varchar('source_lang', { length: 35 }).notNull(),
    targetLang: varchar('target_lang', { length: 35 }).notNull(),
    autoPassThreshold: integer('auto_pass_threshold').notNull(),
    l2ConfidenceMin: integer('l2_confidence_min').notNull(),
    l3ConfidenceMin: integer('l3_confidence_min').notNull(),
    mutedCategories: jsonb('muted_categories'),
    wordSegmenter: varchar('word_segmenter', { length: 20 }).default('intl').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'language_pair_configs_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    unique('uq_language_pair_configs_tenant_langs').on(
      table.tenantId,
      table.sourceLang,
      table.targetLang,
    ),
    pgPolicy('Tenant isolation: DELETE', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const severityConfigs = pgTable(
  'severity_configs',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid('tenant_id'),
    severity: varchar({ length: 20 }).notNull(),
    penaltyWeight: real('penalty_weight').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'severity_configs_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    pgPolicy('Delete: tenant-scoped', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Read: all authenticated', { as: 'permissive', for: 'select', to: ['authenticated'] }),
    pgPolicy('Update: tenant-scoped', { as: 'permissive', for: 'update', to: ['authenticated'] }),
    pgPolicy('Write: tenant-scoped', { as: 'permissive', for: 'insert', to: ['authenticated'] }),
  ],
)

export const taxonomyDefinitions = pgTable(
  'taxonomy_definitions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    category: varchar({ length: 100 }).notNull(),
    parentCategory: varchar('parent_category', { length: 100 }),
    description: text().notNull(),
    isCustom: boolean('is_custom').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (_table) => [
    pgPolicy('Read: all authenticated', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
      using: sql`true`,
    }),
  ],
)

export const feedbackEvents = pgTable(
  'feedback_events',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    findingId: uuid('finding_id'),
    fileId: uuid('file_id').notNull(),
    projectId: uuid('project_id').notNull(),
    reviewerId: uuid('reviewer_id').notNull(),
    action: varchar({ length: 30 }).notNull(),
    findingCategory: varchar('finding_category', { length: 100 }).notNull(),
    originalSeverity: varchar('original_severity', { length: 20 }).notNull(),
    newSeverity: varchar('new_severity', { length: 20 }),
    layer: varchar({ length: 10 }).notNull(),
    isFalsePositive: boolean('is_false_positive').notNull(),
    reviewerIsNative: boolean('reviewer_is_native').notNull(),
    sourceLang: varchar('source_lang', { length: 35 }).notNull(),
    targetLang: varchar('target_lang', { length: 35 }).notNull(),
    sourceText: text('source_text').notNull(),
    originalTarget: text('original_target').notNull(),
    correctedTarget: text('corrected_target'),
    detectedByLayer: varchar('detected_by_layer', { length: 10 }).notNull(),
    aiModel: varchar('ai_model', { length: 100 }),
    aiConfidence: real('ai_confidence'),
    metadata: jsonb(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'feedback_events_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.findingId],
      foreignColumns: [findings.id],
      name: 'feedback_events_finding_id_findings_id_fk',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.fileId],
      foreignColumns: [files.id],
      name: 'feedback_events_file_id_files_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'feedback_events_project_id_projects_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.reviewerId],
      foreignColumns: [users.id],
      name: 'feedback_events_reviewer_id_users_id_fk',
    }).onDelete('restrict'),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
      withCheck: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
  ],
)

export const runMetadata = pgTable(
  'run_metadata',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    fileId: uuid('file_id').notNull(),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    modelVersions: jsonb('model_versions').notNull(),
    glossaryVersion: varchar('glossary_version', { length: 100 }).notNull(),
    ruleConfigHash: varchar('rule_config_hash', { length: 255 }).notNull(),
    processingMode: varchar('processing_mode', { length: 20 }).notNull(),
    totalCost: real('total_cost').notNull(),
    durationMs: integer('duration_ms').notNull(),
    layerCompleted: varchar('layer_completed', { length: 10 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.fileId],
      foreignColumns: [files.id],
      name: 'run_metadata_file_id_files_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'run_metadata_project_id_projects_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'run_metadata_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
      withCheck: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
  ],
)

export const suppressionRules = pgTable(
  'suppression_rules',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    pattern: text().notNull(),
    category: varchar({ length: 100 }).notNull(),
    scope: varchar({ length: 20 }).notNull(),
    reason: text().notNull(),
    createdBy: uuid('created_by').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'suppression_rules_project_id_projects_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'suppression_rules_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'suppression_rules_created_by_users_id_fk',
    }).onDelete('restrict'),
    pgPolicy('Tenant isolation: DELETE', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const fileAssignments = pgTable(
  'file_assignments',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    fileId: uuid('file_id').notNull(),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    assignedTo: uuid('assigned_to').notNull(),
    assignedBy: uuid('assigned_by').notNull(),
    status: varchar({ length: 20 }).default('pending').notNull(),
    priority: varchar({ length: 20 }),
    notes: text(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.fileId],
      foreignColumns: [files.id],
      name: 'file_assignments_file_id_files_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'file_assignments_project_id_projects_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'file_assignments_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.assignedTo],
      foreignColumns: [users.id],
      name: 'file_assignments_assigned_to_users_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.assignedBy],
      foreignColumns: [users.id],
      name: 'file_assignments_assigned_by_users_id_fk',
    }).onDelete('restrict'),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('file_assignments_delete_admin', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
    }),
    pgPolicy('file_assignments_insert_admin_qa', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('file_assignments_update_admin_qa', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const aiUsageLogs = pgTable(
  'ai_usage_logs',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    fileId: uuid('file_id').notNull(),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    layer: varchar({ length: 10 }).notNull(),
    model: varchar({ length: 100 }).notNull(),
    provider: varchar({ length: 50 }).notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    estimatedCost: real('estimated_cost').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    status: varchar({ length: 30 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    chunkIndex: integer('chunk_index'),
    languagePair: varchar('language_pair', { length: 50 }),
  },
  (table) => [
    index('idx_ai_usage_logs_tenant_created').using(
      'btree',
      table.tenantId.asc().nullsLast().op('timestamptz_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('idx_ai_usage_logs_tenant_project_created').using(
      'btree',
      table.tenantId.asc().nullsLast().op('timestamptz_ops'),
      table.projectId.asc().nullsLast().op('timestamptz_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.fileId],
      foreignColumns: [files.id],
      name: 'ai_usage_logs_file_id_files_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'ai_usage_logs_project_id_projects_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'ai_usage_logs_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
      withCheck: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
  ],
)

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    role: varchar({ length: 50 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_user_roles_user').using('btree', table.userId.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_roles_user_id_users_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'user_roles_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    unique('uq_user_roles_user_tenant').on(table.userId, table.tenantId),
    pgPolicy('Tenant isolation: DELETE', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const glossaryTerms = pgTable(
  'glossary_terms',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    glossaryId: uuid('glossary_id').notNull(),
    sourceTerm: varchar('source_term', { length: 500 }).notNull(),
    targetTerm: varchar('target_term', { length: 500 }).notNull(),
    caseSensitive: boolean('case_sensitive').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
  },
  (table) => [
    index('idx_glossary_terms_tenant').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.glossaryId],
      foreignColumns: [glossaries.id],
      name: 'glossary_terms_glossary_id_glossaries_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'glossary_terms_tenant_id_fkey',
    }).onDelete('restrict'),
    pgPolicy('Tenant isolation: DELETE', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const segments = pgTable(
  'segments',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    fileId: uuid('file_id').notNull(),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    segmentNumber: integer('segment_number').notNull(),
    sourceText: text('source_text').notNull(),
    targetText: text('target_text').notNull(),
    sourceLang: varchar('source_lang', { length: 35 }).notNull(),
    targetLang: varchar('target_lang', { length: 35 }).notNull(),
    wordCount: integer('word_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    confirmationState: varchar('confirmation_state', { length: 30 }),
    matchPercentage: integer('match_percentage'),
    translatorComment: text('translator_comment'),
    inlineTags: jsonb('inline_tags'),
  },
  (table) => [
    index('idx_segments_file').using('btree', table.fileId.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.fileId],
      foreignColumns: [files.id],
      name: 'segments_file_id_files_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'segments_project_id_projects_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'segments_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    pgPolicy('segments_delete_admin', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`((tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid) AND ((( SELECT auth.jwt() AS jwt) ->> 'user_role'::text) = 'admin'::text))`,
    }),
    pgPolicy('segments_insert_admin_qa', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('segments_select_admin_qa', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('segments_select_native', { as: 'permissive', for: 'select', to: ['authenticated'] }),
    pgPolicy('segments_update_admin_qa', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const notifications = pgTable(
  'notifications',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    type: varchar({ length: 50 }).notNull(),
    title: varchar({ length: 255 }).notNull(),
    body: text().notNull(),
    isRead: boolean('is_read').default(false).notNull(),
    metadata: jsonb(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'notifications_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'notifications_user_id_users_id_fk',
    }).onDelete('cascade'),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
      withCheck: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const exportedReports = pgTable(
  'exported_reports',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    format: varchar({ length: 10 }).notNull(),
    storagePath: varchar('storage_path', { length: 1000 }).notNull(),
    generatedBy: uuid('generated_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'exported_reports_project_id_projects_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'exported_reports_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.generatedBy],
      foreignColumns: [users.id],
      name: 'exported_reports_generated_by_users_id_fk',
    }).onDelete('restrict'),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
      withCheck: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
  ],
)

export const auditResults = pgTable(
  'audit_results',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    auditType: varchar('audit_type', { length: 100 }).notNull(),
    result: jsonb().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'audit_results_project_id_projects_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'audit_results_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
      withCheck: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
  ],
)

export const aiMetricsTimeseries = pgTable(
  'ai_metrics_timeseries',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    metricType: varchar('metric_type', { length: 100 }).notNull(),
    metricValue: real('metric_value').notNull(),
    periodStart: timestamp('period_start', { withTimezone: true, mode: 'string' }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true, mode: 'string' }).notNull(),
    metadata: jsonb(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'ai_metrics_timeseries_project_id_projects_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'ai_metrics_timeseries_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
      withCheck: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
  ],
)

export const fixSuggestions = pgTable(
  'fix_suggestions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    findingId: uuid('finding_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    suggestedText: text('suggested_text').notNull(),
    model: varchar({ length: 100 }).notNull(),
    confidence: real().notNull(),
    status: varchar({ length: 20 }).default('pending').notNull(),
    mode: varchar({ length: 20 }).default('disabled').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.findingId],
      foreignColumns: [findings.id],
      name: 'fix_suggestions_finding_id_findings_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'fix_suggestions_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
      withCheck: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const selfHealingConfig = pgTable(
  'self_healing_config',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    projectId: uuid('project_id'),
    config: jsonb().notNull(),
    mode: varchar({ length: 20 }).default('disabled').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'self_healing_config_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'self_healing_config_project_id_projects_id_fk',
    }).onDelete('cascade'),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
      withCheck: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const uploadBatches = pgTable(
  'upload_batches',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    fileCount: integer('file_count').notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'upload_batches_project_id_projects_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'upload_batches_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'upload_batches_created_by_users_id_fk',
    }).onDelete('set null'),
    pgPolicy('Tenant isolation: DELETE', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const files = pgTable(
  'files',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    fileName: varchar('file_name', { length: 500 }).notNull(),
    fileType: varchar('file_type', { length: 20 }).notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    storagePath: varchar('storage_path', { length: 1000 }).notNull(),
    status: varchar({ length: 20 }).default('uploaded').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    fileHash: varchar('file_hash', { length: 64 }),
    uploadedBy: uuid('uploaded_by'),
    batchId: uuid('batch_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('files_tenant_id_project_id_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops'),
      table.projectId.asc().nullsLast().op('uuid_ops'),
    ),
    index('files_tenant_project_hash_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.projectId.asc().nullsLast().op('text_ops'),
      table.fileHash.asc().nullsLast().op('uuid_ops'),
    ),
    uniqueIndex('uq_files_project_hash')
      .using(
        'btree',
        table.projectId.asc().nullsLast().op('text_ops'),
        table.fileHash.asc().nullsLast().op('text_ops'),
      )
      .where(sql`(file_hash IS NOT NULL)`),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'files_project_id_projects_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'files_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.uploadedBy],
      foreignColumns: [users.id],
      name: 'files_uploaded_by_users_id_fk',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.batchId],
      foreignColumns: [uploadBatches.id],
      name: 'files_batch_id_upload_batches_id_fk',
    }).onDelete('set null'),
    pgPolicy('Tenant isolation: DELETE', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`(tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid)`,
    }),
    pgPolicy('Tenant isolation: INSERT', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: SELECT', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('Tenant isolation: UPDATE', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
  ],
)

export const findings = pgTable(
  'findings',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    segmentId: uuid('segment_id'),
    projectId: uuid('project_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    reviewSessionId: uuid('review_session_id'),
    status: varchar({ length: 30 }).default('pending').notNull(),
    severity: varchar({ length: 20 }).notNull(),
    category: varchar({ length: 100 }).notNull(),
    description: text().notNull(),
    detectedByLayer: varchar('detected_by_layer', { length: 10 }).notNull(),
    aiModel: varchar('ai_model', { length: 100 }),
    aiConfidence: real('ai_confidence'),
    suggestedFix: text('suggested_fix'),
    segmentCount: integer('segment_count').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    fileId: uuid('file_id'),
    sourceTextExcerpt: text('source_text_excerpt'),
    targetTextExcerpt: text('target_text_excerpt'),
    scope: varchar({ length: 30 }).default('per-file').notNull(),
    relatedFileIds: jsonb('related_file_ids'),
  },
  (table) => [
    index('idx_findings_file_layer').using(
      'btree',
      table.fileId.asc().nullsLast().op('text_ops'),
      table.detectedByLayer.asc().nullsLast().op('text_ops'),
    ),
    index('idx_findings_project_status').using(
      'btree',
      table.projectId.asc().nullsLast().op('uuid_ops'),
      table.status.asc().nullsLast().op('uuid_ops'),
    ),
    index('idx_findings_scope')
      .using('btree', table.scope.asc().nullsLast().op('text_ops'))
      .where(sql`((scope)::text <> 'per-file'::text)`),
    index('idx_findings_segment').using('btree', table.segmentId.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.segmentId],
      foreignColumns: [segments.id],
      name: 'findings_segment_id_segments_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
      name: 'findings_project_id_projects_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'findings_tenant_id_tenants_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.reviewSessionId],
      foreignColumns: [reviewSessions.id],
      name: 'findings_review_session_id_review_sessions_id_fk',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.fileId],
      foreignColumns: [files.id],
      name: 'findings_file_id_fkey',
    }).onDelete('cascade'),
    pgPolicy('findings_delete_admin', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
      using: sql`((tenant_id = ((( SELECT auth.jwt() AS jwt) ->> 'tenant_id'::text))::uuid) AND ((( SELECT auth.jwt() AS jwt) ->> 'user_role'::text) = 'admin'::text))`,
    }),
    pgPolicy('findings_insert_admin_qa', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('findings_select_admin_qa', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('findings_select_native', { as: 'permissive', for: 'select', to: ['authenticated'] }),
    pgPolicy('findings_update_admin_qa', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    pgPolicy('findings_update_native', { as: 'permissive', for: 'update', to: ['authenticated'] }),
  ],
)

export const auditLogs202603 = pgTable(
  'audit_logs_2026_03',
  {
    id: uuid().defaultRandom().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id'),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: varchar({ length: 100 }).notNull(),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('audit_logs_2026_03_entity_type_entity_id_idx').using(
      'btree',
      table.entityType.asc().nullsLast().op('uuid_ops'),
      table.entityId.asc().nullsLast().op('uuid_ops'),
    ),
    index('audit_logs_2026_03_tenant_id_created_at_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'audit_logs_tenant_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'audit_logs_user_id_fkey',
    }).onDelete('set null'),
    primaryKey({ columns: [table.id, table.createdAt], name: 'audit_logs_2026_03_pkey' }),
  ],
)

export const auditLogs202602 = pgTable(
  'audit_logs_2026_02',
  {
    id: uuid().defaultRandom().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id'),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: varchar({ length: 100 }).notNull(),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('audit_logs_2026_02_entity_type_entity_id_idx').using(
      'btree',
      table.entityType.asc().nullsLast().op('uuid_ops'),
      table.entityId.asc().nullsLast().op('uuid_ops'),
    ),
    index('audit_logs_2026_02_tenant_id_created_at_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'audit_logs_tenant_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'audit_logs_user_id_fkey',
    }).onDelete('set null'),
    primaryKey({ columns: [table.id, table.createdAt], name: 'audit_logs_2026_02_pkey' }),
  ],
)

export const auditLogs202604 = pgTable(
  'audit_logs_2026_04',
  {
    id: uuid().defaultRandom().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id'),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: varchar({ length: 100 }).notNull(),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('audit_logs_2026_04_entity_type_entity_id_idx').using(
      'btree',
      table.entityType.asc().nullsLast().op('uuid_ops'),
      table.entityId.asc().nullsLast().op('uuid_ops'),
    ),
    index('audit_logs_2026_04_tenant_id_created_at_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'audit_logs_tenant_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'audit_logs_user_id_fkey',
    }).onDelete('set null'),
    primaryKey({ columns: [table.id, table.createdAt], name: 'audit_logs_2026_04_pkey' }),
  ],
)

export const auditLogs202605 = pgTable(
  'audit_logs_2026_05',
  {
    id: uuid().defaultRandom().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id'),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: varchar({ length: 100 }).notNull(),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('audit_logs_2026_05_entity_type_entity_id_idx').using(
      'btree',
      table.entityType.asc().nullsLast().op('uuid_ops'),
      table.entityId.asc().nullsLast().op('uuid_ops'),
    ),
    index('audit_logs_2026_05_tenant_id_created_at_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'audit_logs_tenant_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'audit_logs_user_id_fkey',
    }).onDelete('set null'),
    primaryKey({ columns: [table.id, table.createdAt], name: 'audit_logs_2026_05_pkey' }),
  ],
)

export const auditLogs202606 = pgTable(
  'audit_logs_2026_06',
  {
    id: uuid().defaultRandom().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id'),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: varchar({ length: 100 }).notNull(),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('audit_logs_2026_06_entity_type_entity_id_idx').using(
      'btree',
      table.entityType.asc().nullsLast().op('uuid_ops'),
      table.entityId.asc().nullsLast().op('uuid_ops'),
    ),
    index('audit_logs_2026_06_tenant_id_created_at_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'audit_logs_tenant_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'audit_logs_user_id_fkey',
    }).onDelete('set null'),
    primaryKey({ columns: [table.id, table.createdAt], name: 'audit_logs_2026_06_pkey' }),
  ],
)
