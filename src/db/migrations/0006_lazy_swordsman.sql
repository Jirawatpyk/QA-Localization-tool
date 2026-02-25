CREATE TABLE "missing_check_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"file_reference" text NOT NULL,
	"segment_number" integer NOT NULL,
	"expected_description" text NOT NULL,
	"xbench_check_type" text NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"tracking_reference" text NOT NULL,
	"reported_by" uuid NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "missing_check_reports_tracking_reference_unique" UNIQUE("tracking_reference")
);
--> statement-breakpoint
CREATE TABLE "parity_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"file_id" uuid,
	"tool_finding_count" integer DEFAULT 0 NOT NULL,
	"xbench_finding_count" integer DEFAULT 0 NOT NULL,
	"both_found_count" integer DEFAULT 0 NOT NULL,
	"tool_only_count" integer DEFAULT 0 NOT NULL,
	"xbench_only_count" integer DEFAULT 0 NOT NULL,
	"comparison_data" jsonb NOT NULL,
	"xbench_report_storage_path" text NOT NULL,
	"generated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "findings" ALTER COLUMN "segment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "scope" varchar(30) DEFAULT 'per-file' NOT NULL;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "related_file_ids" jsonb;--> statement-breakpoint
ALTER TABLE "missing_check_reports" ADD CONSTRAINT "missing_check_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_check_reports" ADD CONSTRAINT "missing_check_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_check_reports" ADD CONSTRAINT "missing_check_reports_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_check_reports" ADD CONSTRAINT "missing_check_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parity_reports" ADD CONSTRAINT "parity_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parity_reports" ADD CONSTRAINT "parity_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parity_reports" ADD CONSTRAINT "parity_reports_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parity_reports" ADD CONSTRAINT "parity_reports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;