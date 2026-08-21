ALTER TYPE "public"."tool_status" ADD VALUE IF NOT EXISTS 'degraded' BEFORE 'deprecated';--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "verify_success_streak" integer DEFAULT 0 NOT NULL;
