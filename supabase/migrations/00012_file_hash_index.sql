-- Story 2.1 follow-up: add indexes for files table
-- 00005_performance_indexes.sql covers audit_logs/findings/segments/scores/user_roles but NOT files

-- For duplicate detection: checkDuplicate queries files by (tenant_id, project_id, file_hash)
CREATE INDEX IF NOT EXISTS "files_tenant_project_hash_idx"
  ON "files" ("tenant_id", "project_id", "file_hash");

-- For getUploadedFiles: lists files by (tenant_id, project_id) ordered by created_at
CREATE INDEX IF NOT EXISTS "files_tenant_id_project_id_idx"
  ON "files" ("tenant_id", "project_id");
