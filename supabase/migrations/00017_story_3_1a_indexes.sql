-- Story 3.1a: AI Usage Dashboard & Reporting — Performance Indexes
-- Dashboard queries aggregate ai_usage_logs by tenant_id + created_at.
-- These compound indexes prevent full-table scans on large usage log tables.

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_tenant_created
  ON ai_usage_logs (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_tenant_project_created
  ON ai_usage_logs (tenant_id, project_id, created_at);
