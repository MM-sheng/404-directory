CREATE TABLE IF NOT EXISTS "verified_agent_admissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_key" text NOT NULL,
	"operator_key" text NOT NULL,
	"source" text NOT NULL,
	"verification_method" text NOT NULL,
	"evidence_ref_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "verified_agent_admissions_agent_uidx" ON "verified_agent_admissions" USING btree ("agent_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_agent_admissions_operator_idx" ON "verified_agent_admissions" USING btree ("operator_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_agent_admissions_source_idx" ON "verified_agent_admissions" USING btree ("source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_agent_admissions_status_idx" ON "verified_agent_admissions" USING btree ("status");
