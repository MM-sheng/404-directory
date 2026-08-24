CREATE TABLE IF NOT EXISTS "risk_evaluations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_tool_id" uuid NOT NULL,
	"target_snapshot" jsonb NOT NULL,
	"policy_version" text NOT NULL,
	"context" jsonb NOT NULL,
	"decision" text NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"evidence_coverage" numeric(5, 4) NOT NULL,
	"reason_codes" text[] DEFAULT '{}' NOT NULL,
	"risk_factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unknowns" text[] DEFAULT '{}' NOT NULL,
	"next_action" text NOT NULL,
	"outcome_token_hash" text NOT NULL,
	"agent_key" text,
	"agent_identity_kind" text DEFAULT 'anonymous' NOT NULL,
	"client_name" text,
	"attribution_source" text,
	"is_external" boolean DEFAULT false NOT NULL,
	"outcome" jsonb,
	"outcome_reported_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "risk_evaluations_target_tool_id_tools_id_fk" FOREIGN KEY ("target_tool_id") REFERENCES "public"."tools"("id") ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "risk_evaluations_outcome_token_uidx" ON "risk_evaluations" USING btree ("outcome_token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risk_evaluations_target_idx" ON "risk_evaluations" USING btree ("target_tool_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risk_evaluations_agent_idx" ON "risk_evaluations" USING btree ("agent_key", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risk_evaluations_decision_idx" ON "risk_evaluations" USING btree ("decision", "created_at");
