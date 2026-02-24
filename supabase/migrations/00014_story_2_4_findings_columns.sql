-- Story 2.4: Rule-based QA Engine — ALTER TABLE findings
-- Add 3 columns for L1 rule engine findings + index for query performance

ALTER TABLE findings ADD COLUMN file_id UUID REFERENCES files(id) ON DELETE CASCADE;
ALTER TABLE findings ADD COLUMN source_text_excerpt TEXT;
ALTER TABLE findings ADD COLUMN target_text_excerpt TEXT;

-- Composite index for L1/L2/L3 findings queries per file
CREATE INDEX idx_findings_file_layer ON findings(file_id, detected_by_layer);
