ALTER TABLE "invocations" ADD COLUMN IF NOT EXISTS "request_id" text;--> statement-breakpoint
ALTER TABLE "invocations" ADD COLUMN IF NOT EXISTS "session_key" text;--> statement-breakpoint
ALTER TABLE "invocations" ADD COLUMN IF NOT EXISTS "result_count" integer;--> statement-breakpoint
ALTER TABLE "invocations" ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invocations" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invocations_request_id_idx" ON "invocations" USING btree ("request_id");
