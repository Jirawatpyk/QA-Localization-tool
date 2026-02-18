-- Performance indexes per Architecture specification

-- Audit logs: composite indexes for common query patterns
CREATE INDEX idx_audit_logs_tenant_created ON audit_logs (tenant_id, created_at);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);

-- Findings: segment lookup and project status filtering
CREATE INDEX idx_findings_segment ON findings (segment_id);
CREATE INDEX idx_findings_project_status ON findings (project_id, status);

-- Segments: file lookup
CREATE INDEX idx_segments_file ON segments (file_id);

-- Scores: project lookup
CREATE INDEX idx_scores_project ON scores (project_id);

-- User roles: user lookup
CREATE INDEX idx_user_roles_user ON user_roles (user_id);
