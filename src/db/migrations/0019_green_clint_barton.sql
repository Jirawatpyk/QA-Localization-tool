ALTER TABLE "file_assignments" ALTER COLUMN "status" SET DEFAULT 'assigned';--> statement-breakpoint
ALTER TABLE "file_assignments" ALTER COLUMN "priority" SET DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE "file_assignments" ALTER COLUMN "priority" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "file_assignments" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "file_assignments" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "file_assignments" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_file_assignments_active" ON "file_assignments" USING btree ("file_id","tenant_id") WHERE status IN ('assigned', 'in_progress');--> statement-breakpoint
CREATE INDEX "idx_file_assignments_assigned_to_status" ON "file_assignments" USING btree ("assigned_to","status");--> statement-breakpoint
CREATE INDEX "idx_file_assignments_file_tenant" ON "file_assignments" USING btree ("file_id","tenant_id");