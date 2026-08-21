ALTER TABLE "tools" ADD COLUMN "last_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "next_verify_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "verify_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "verify_fail_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "tools_next_verify_idx" ON "tools" USING btree ("next_verify_at");--> statement-breakpoint
CREATE TABLE "usage_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" text,
	"discovery_query" jsonb,
	"candidate_slugs" text[] DEFAULT '{}' NOT NULL,
	"selected_slug" text,
	"outcome" text DEFAULT 'unknown' NOT NULL,
	"latency_ms" integer,
	"error_type" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "usage_receipts_created_idx" ON "usage_receipts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "usage_receipts_selected_idx" ON "usage_receipts" USING btree ("selected_slug","created_at");
