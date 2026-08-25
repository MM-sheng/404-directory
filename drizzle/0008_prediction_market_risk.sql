CREATE TABLE IF NOT EXISTS "prediction_market_evaluations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"market_id" text NOT NULL,
	"market_slug" text NOT NULL,
	"market_question" text NOT NULL,
	"market_snapshot" jsonb NOT NULL,
	"policy_version" text NOT NULL,
	"intent" jsonb NOT NULL,
	"decision" text NOT NULL,
	"risk_score" integer NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"reason_codes" text[] DEFAULT '{}' NOT NULL,
	"risk_factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unknowns" text[] DEFAULT '{}' NOT NULL,
	"depth" jsonb,
	"next_action" text NOT NULL,
	"snapshot_hash" text NOT NULL,
	"outcome_token_hash" text NOT NULL,
	"agent_key" text,
	"agent_identity_kind" text DEFAULT 'anonymous' NOT NULL,
	"client_name" text,
	"attribution_source" text,
	"is_external" boolean DEFAULT false NOT NULL,
	"outcome" jsonb,
	"outcome_reported_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prediction_market_eval_outcome_token_uidx" ON "prediction_market_evaluations" USING btree ("outcome_token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prediction_market_eval_market_idx" ON "prediction_market_evaluations" USING btree ("platform", "market_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prediction_market_eval_agent_idx" ON "prediction_market_evaluations" USING btree ("agent_key", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prediction_market_eval_decision_idx" ON "prediction_market_evaluations" USING btree ("decision", "created_at");
