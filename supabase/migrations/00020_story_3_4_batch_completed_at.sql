-- Story 3.4: Add completed_at column to upload_batches for atomic batch completion
-- Sentinel pattern: UPDATE ... WHERE completed_at IS NULL ensures only one writer marks batch complete
ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS completed_at timestamptz;
