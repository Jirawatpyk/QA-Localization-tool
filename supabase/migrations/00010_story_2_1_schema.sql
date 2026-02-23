-- Story 2.1: File Upload & Storage Infrastructure
-- Creates upload_batches table and adds file tracking columns to files table

-- =============================================================================
-- UPLOAD_BATCHES TABLE
-- =============================================================================
CREATE TABLE "upload_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "file_count" integer NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "upload_batches"
  ADD CONSTRAINT "upload_batches_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "upload_batches"
  ADD CONSTRAINT "upload_batches_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "upload_batches"
  ADD CONSTRAINT "upload_batches_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

-- =============================================================================
-- FILES TABLE — add tracking columns
-- =============================================================================
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "file_hash" varchar(64);
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "uploaded_by" uuid;
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "batch_id" uuid;

ALTER TABLE "files"
  ADD CONSTRAINT "files_uploaded_by_users_id_fk"
  FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "files"
  ADD CONSTRAINT "files_batch_id_upload_batches_id_fk"
  FOREIGN KEY ("batch_id") REFERENCES "public"."upload_batches"("id") ON DELETE set null ON UPDATE no action;
