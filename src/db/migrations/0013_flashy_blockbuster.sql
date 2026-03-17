ALTER TABLE "suppression_rules" ADD COLUMN "duration" varchar(30) DEFAULT 'until_improved' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppression_rules" ADD COLUMN "file_id" uuid;--> statement-breakpoint
ALTER TABLE "suppression_rules" ADD COLUMN "source_lang" varchar(35);--> statement-breakpoint
ALTER TABLE "suppression_rules" ADD COLUMN "target_lang" varchar(35);--> statement-breakpoint
ALTER TABLE "suppression_rules" ADD COLUMN "match_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "suppression_rules" ADD CONSTRAINT "suppression_rules_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "suppression_rules" SET "scope" = 'all' WHERE "scope" IN ('project', 'tenant');