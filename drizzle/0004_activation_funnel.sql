CREATE TABLE IF NOT EXISTS "activation_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"stage" text NOT NULL,
	"source" text NOT NULL,
	"client" text,
	"agent_key" text,
	"agent_identity_kind" text DEFAULT 'anonymous' NOT NULL,
	"is_external" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activation_events_stage_idx" ON "activation_events" USING btree ("stage","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activation_events_source_idx" ON "activation_events" USING btree ("source","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activation_events_agent_idx" ON "activation_events" USING btree ("agent_key","created_at");
