ALTER TABLE "invocations" ADD COLUMN IF NOT EXISTS "agent_key" text;--> statement-breakpoint
ALTER TABLE "invocations" ADD COLUMN IF NOT EXISTS "agent_identity_kind" text;--> statement-breakpoint
ALTER TABLE "invocations" ADD COLUMN IF NOT EXISTS "client_name" text;--> statement-breakpoint
ALTER TABLE "invocations" ADD COLUMN IF NOT EXISTS "attribution_source" text;--> statement-breakpoint
ALTER TABLE "invocations" ADD COLUMN IF NOT EXISTS "is_external" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invocations_agent_key_idx" ON "invocations" USING btree ("agent_key","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invocations_external_idx" ON "invocations" USING btree ("is_external","success","created_at");
