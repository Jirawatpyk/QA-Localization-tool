ALTER TABLE "taxonomy_definitions" ADD COLUMN "internal_name" varchar(200);--> statement-breakpoint
ALTER TABLE "taxonomy_definitions" ADD COLUMN "severity" varchar(20) DEFAULT 'minor';--> statement-breakpoint
ALTER TABLE "taxonomy_definitions" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "taxonomy_definitions" ADD COLUMN "display_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "taxonomy_definitions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;