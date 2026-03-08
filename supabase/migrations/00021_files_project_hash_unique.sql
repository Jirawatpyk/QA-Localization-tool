-- TD-DB-005: Partial unique index on files(project_id, file_hash)
-- Prevents concurrent duplicate uploads bypassing client-side SHA-256 check
-- Partial: only enforced when file_hash IS NOT NULL (files mid-upload have no hash yet)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_files_project_hash"
  ON "files" USING btree ("project_id", "file_hash")
  WHERE "file_hash" IS NOT NULL;
