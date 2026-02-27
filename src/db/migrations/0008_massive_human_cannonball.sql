ALTER TABLE "ai_usage_logs" ADD COLUMN "chunk_index" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "budget_alert_threshold_pct" integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "l2_pinned_model" varchar(100);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "l3_pinned_model" varchar(100);