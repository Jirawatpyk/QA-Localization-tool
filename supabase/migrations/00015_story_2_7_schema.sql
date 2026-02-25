-- Story 2.7: Batch Summary, File History & Parity Tools
-- New tables: parity_reports, missing_check_reports
-- ALTER: files (add updated_at), findings (nullable segment_id, add scope, related_file_ids)

-- Task 1.3a: files.updatedAt for processing time calculation (AC #1)
ALTER TABLE files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Task 1.3b: findings schema changes for cross-file support
ALTER TABLE findings ALTER COLUMN segment_id DROP NOT NULL;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS scope VARCHAR(30) NOT NULL DEFAULT 'per-file';
ALTER TABLE findings ADD COLUMN IF NOT EXISTS related_file_ids JSONB;

-- Task 1.1: parity_reports table
CREATE TABLE IF NOT EXISTS parity_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  tool_finding_count INTEGER NOT NULL DEFAULT 0,
  xbench_finding_count INTEGER NOT NULL DEFAULT 0,
  both_found_count INTEGER NOT NULL DEFAULT 0,
  tool_only_count INTEGER NOT NULL DEFAULT 0,
  xbench_only_count INTEGER NOT NULL DEFAULT 0,
  comparison_data JSONB NOT NULL,
  xbench_report_storage_path TEXT NOT NULL,
  generated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Task 1.2: missing_check_reports table
CREATE TABLE IF NOT EXISTS missing_check_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  file_reference TEXT NOT NULL,
  segment_number INTEGER NOT NULL,
  expected_description TEXT NOT NULL,
  xbench_check_type TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  tracking_reference TEXT NOT NULL UNIQUE,
  reported_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: parity_reports
ALTER TABLE parity_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parity_reports_tenant_isolation_select" ON parity_reports
  FOR SELECT USING (
    tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
  );

CREATE POLICY "parity_reports_tenant_isolation_insert" ON parity_reports
  FOR INSERT WITH CHECK (
    tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
  );

-- RLS: missing_check_reports
ALTER TABLE missing_check_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "missing_check_reports_tenant_isolation_select" ON missing_check_reports
  FOR SELECT USING (
    tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
  );

CREATE POLICY "missing_check_reports_tenant_isolation_insert" ON missing_check_reports
  FOR INSERT WITH CHECK (
    tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
  );

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_parity_reports_project ON parity_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_parity_reports_tenant ON parity_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_missing_check_reports_project ON missing_check_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_missing_check_reports_tenant ON missing_check_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_missing_check_reports_tracking ON missing_check_reports(tracking_reference);
CREATE INDEX IF NOT EXISTS idx_findings_scope ON findings(scope) WHERE scope != 'per-file';
