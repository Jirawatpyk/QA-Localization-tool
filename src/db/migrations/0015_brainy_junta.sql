CREATE TABLE "back_translation_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"language_pair" varchar(50) NOT NULL,
	"model_version" varchar(100) NOT NULL,
	"target_text_hash" varchar(64) NOT NULL,
	"back_translation" text NOT NULL,
	"contextual_explanation" text NOT NULL,
	"confidence" real NOT NULL,
	"language_notes" jsonb NOT NULL,
	"translation_approach" text,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"estimated_cost_usd" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_bt_cache_segment_lang_model_hash" UNIQUE("segment_id","language_pair","model_version","target_text_hash")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "bt_confidence_threshold" real DEFAULT 0.6 NOT NULL;--> statement-breakpoint
ALTER TABLE "back_translation_cache" ADD CONSTRAINT "back_translation_cache_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "back_translation_cache" ADD CONSTRAINT "back_translation_cache_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bt_cache_lookup" ON "back_translation_cache" USING btree ("segment_id","language_pair","model_version");--> statement-breakpoint
CREATE INDEX "idx_bt_cache_ttl_cleanup" ON "back_translation_cache" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "back_translation_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "bt_cache_tenant_select" ON "back_translation_cache" FOR SELECT TO authenticated USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);--> statement-breakpoint
CREATE POLICY "bt_cache_tenant_insert" ON "back_translation_cache" FOR INSERT TO authenticated WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);--> statement-breakpoint
CREATE POLICY "bt_cache_tenant_update" ON "back_translation_cache" FOR UPDATE TO authenticated USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid) WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);