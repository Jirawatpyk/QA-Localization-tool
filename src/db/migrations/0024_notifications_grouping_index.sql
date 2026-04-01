-- Story 6-2a: Add grouping index for notification server-side grouping (AC2)
-- Used by Story 6-2c for grouping by (user_id, type, created_at)
-- Partial index: only non-archived notifications

CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created
  ON notifications (user_id, type, created_at DESC)
  WHERE archived_at IS NULL;
