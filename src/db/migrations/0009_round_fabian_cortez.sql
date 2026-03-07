ALTER TABLE "ai_usage_logs" ADD COLUMN "language_pair" varchar(50);--> statement-breakpoint
ALTER TABLE "upload_batches" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_files_tenant_project" ON "files" USING btree ("tenant_id","project_id");