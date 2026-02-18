-- RLS Policies for all tables with tenant_id
-- Applied AFTER Drizzle migrations (tables must exist first)
-- Performance: Uses (SELECT auth.jwt()) subquery wrapper for per-query caching (94-99% faster)

-- Helper: Generate tenant isolation policies for a table
-- Pattern applied to all tenant-scoped tables

-- =============================================================================
-- TENANTS (self-referencing — users see their own tenant only)
-- =============================================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON tenants
  FOR SELECT TO authenticated
  USING (id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON tenants
  FOR INSERT TO authenticated
  WITH CHECK (id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON tenants
  FOR UPDATE TO authenticated
  USING (id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON tenants
  FOR DELETE TO authenticated
  USING (id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- USERS
-- =============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON users
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON users
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON users
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON users
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- USER_ROLES
-- =============================================================================
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON user_roles
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON user_roles
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON user_roles
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON user_roles
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- PROJECTS
-- =============================================================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON projects
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON projects
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON projects
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON projects
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- FILES
-- =============================================================================
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON files
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON files
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON files
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON files
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- SEGMENTS
-- =============================================================================
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON segments
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON segments
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON segments
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON segments
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- FINDINGS
-- =============================================================================
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON findings
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON findings
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON findings
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON findings
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- SCORES
-- =============================================================================
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON scores
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON scores
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON scores
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON scores
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- REVIEW_SESSIONS
-- =============================================================================
ALTER TABLE review_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON review_sessions
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON review_sessions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON review_sessions
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON review_sessions
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- REVIEW_ACTIONS
-- =============================================================================
ALTER TABLE review_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON review_actions
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON review_actions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON review_actions
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON review_actions
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- GLOSSARIES
-- =============================================================================
ALTER TABLE glossaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON glossaries
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON glossaries
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON glossaries
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON glossaries
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- GLOSSARY_TERMS (via glossary's tenant_id through join, but has no tenant_id)
-- Note: glossary_terms doesn't have tenant_id directly. Isolation is through
-- the glossary FK. For RLS we use a subquery to check parent glossary's tenant.
-- =============================================================================
ALTER TABLE glossary_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON glossary_terms
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM glossaries
      WHERE glossaries.id = glossary_terms.glossary_id
        AND glossaries.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

CREATE POLICY "Tenant isolation: INSERT" ON glossary_terms
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM glossaries
      WHERE glossaries.id = glossary_terms.glossary_id
        AND glossaries.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

CREATE POLICY "Tenant isolation: UPDATE" ON glossary_terms
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM glossaries
      WHERE glossaries.id = glossary_terms.glossary_id
        AND glossaries.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

CREATE POLICY "Tenant isolation: DELETE" ON glossary_terms
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM glossaries
      WHERE glossaries.id = glossary_terms.glossary_id
        AND glossaries.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

-- =============================================================================
-- LANGUAGE_PAIR_CONFIGS
-- =============================================================================
ALTER TABLE language_pair_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON language_pair_configs
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON language_pair_configs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON language_pair_configs
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON language_pair_configs
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- SEVERITY_CONFIGS — shared reference data, read by all authenticated
-- Per Architecture Decision 1.5: shared reference data (no tenant restriction on SELECT)
-- =============================================================================
ALTER TABLE severity_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read: all authenticated" ON severity_configs
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Write: tenant-scoped" ON severity_configs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid OR tenant_id IS NULL);

CREATE POLICY "Update: tenant-scoped" ON severity_configs
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid OR tenant_id IS NULL)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid OR tenant_id IS NULL);

-- =============================================================================
-- TAXONOMY_DEFINITIONS — NO tenant_id, shared reference data
-- Per Architecture Decision 1.5: shared reference data
-- =============================================================================
ALTER TABLE taxonomy_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read: all authenticated" ON taxonomy_definitions
  FOR SELECT TO authenticated
  USING (true);

-- Only service_role can INSERT/UPDATE taxonomy_definitions (system-managed)

-- =============================================================================
-- AI_USAGE_LOGS
-- =============================================================================
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON ai_usage_logs
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON ai_usage_logs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- FEEDBACK_EVENTS
-- =============================================================================
ALTER TABLE feedback_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON feedback_events
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON feedback_events
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- RUN_METADATA
-- =============================================================================
ALTER TABLE run_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON run_metadata
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON run_metadata
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- SUPPRESSION_RULES
-- =============================================================================
ALTER TABLE suppression_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON suppression_rules
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON suppression_rules
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON suppression_rules
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON suppression_rules
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- FILE_ASSIGNMENTS
-- =============================================================================
ALTER TABLE file_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON file_assignments
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON file_assignments
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON file_assignments
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON file_assignments
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON notifications
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON notifications
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- EXPORTED_REPORTS
-- =============================================================================
ALTER TABLE exported_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON exported_reports
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON exported_reports
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- AUDIT_RESULTS
-- =============================================================================
ALTER TABLE audit_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON audit_results
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON audit_results
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- AI_METRICS_TIMESERIES
-- =============================================================================
ALTER TABLE ai_metrics_timeseries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON ai_metrics_timeseries
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON ai_metrics_timeseries
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- FIX_SUGGESTIONS
-- =============================================================================
ALTER TABLE fix_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON fix_suggestions
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON fix_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON fix_suggestions
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- SELF_HEALING_CONFIG
-- =============================================================================
ALTER TABLE self_healing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON self_healing_config
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON self_healing_config
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON self_healing_config
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);
