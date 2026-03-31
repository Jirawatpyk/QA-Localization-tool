-- Fix: Realtime publication + performance index from 0022 did not apply on cloud
-- Drizzle reported success but DO $$ block + CREATE INDEX IF NOT EXISTS were skipped
-- This migration is idempotent — safe to run on both local (already applied) and cloud

-- Realtime publication (idempotent via IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'file_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE file_assignments;
  END IF;
END $$;

-- Performance index (idempotent via IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_file_assignments_project_status
  ON file_assignments (project_id, status);
