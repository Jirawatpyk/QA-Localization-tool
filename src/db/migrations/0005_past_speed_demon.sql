ALTER TABLE "findings" ADD COLUMN "file_id" uuid;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "source_text_excerpt" text;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "target_text_excerpt" text;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;