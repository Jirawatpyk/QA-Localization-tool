-- Story 3.1: AI Cost Control, Throttling & Model Pinning
-- Adds model pinning columns, budget alert threshold to projects table
-- Adds chunk_index to ai_usage_logs table

-- Projects: Model pinning (AC3)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS l2_pinned_model VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS l3_pinned_model VARCHAR(100);

-- Projects: Budget alert threshold (AC7)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_alert_threshold_pct INTEGER NOT NULL DEFAULT 80;

-- AI Usage Logs: chunk index tracking (AC4)
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS chunk_index INTEGER;

-- NOTE: ai_usage_logs is intentionally append-only — no UPDATE/DELETE RLS policies by design.
-- Existing RLS policies on projects and ai_usage_logs cover new columns (same row-level).
