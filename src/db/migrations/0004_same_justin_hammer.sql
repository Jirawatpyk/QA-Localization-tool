ALTER TABLE "segments" ADD COLUMN "confirmation_state" varchar(30);--> statement-breakpoint
ALTER TABLE "segments" ADD COLUMN "match_percentage" integer;--> statement-breakpoint
ALTER TABLE "segments" ADD COLUMN "translator_comment" text;--> statement-breakpoint
ALTER TABLE "segments" ADD COLUMN "inline_tags" jsonb;