-- Story 2.2: SDLXLIFF & XLIFF 1.2 Unified Parser
-- Adds 4 new columns to segments table for SDLXLIFF/XLIFF metadata

ALTER TABLE "segments" ADD COLUMN IF NOT EXISTS "confirmation_state" varchar(30);
ALTER TABLE "segments" ADD COLUMN IF NOT EXISTS "match_percentage" integer;
ALTER TABLE "segments" ADD COLUMN IF NOT EXISTS "translator_comment" text;
ALTER TABLE "segments" ADD COLUMN IF NOT EXISTS "inline_tags" jsonb;
