-- Story 3.2a: Add language_pair column to ai_usage_logs
-- Tracks source→target language pair for per-language cost analysis

ALTER TABLE ai_usage_logs
ADD COLUMN IF NOT EXISTS language_pair varchar(50);
