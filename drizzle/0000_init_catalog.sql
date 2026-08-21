CREATE TYPE "public"."auth_requirement" AS ENUM('none', 'api_key', 'oauth', 'other');--> statement-breakpoint
CREATE TYPE "public"."check_status" AS ENUM('pass', 'fail', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."check_type" AS ENUM('endpoint_availability', 'mcp_handshake', 'tools_list', 'schema_consistency', 'latency', 'error_rate', 'tls_security');--> statement-breakpoint
CREATE TYPE "public"."endpoint_transport" AS ENUM('http', 'mcp_http', 'mcp_stdio', 'a2a');--> statement-breakpoint
CREATE TYPE "public"."tool_protocol" AS ENUM('mcp', 'api', 'a2a');--> statement-breakpoint
CREATE TYPE "public"."tool_status" AS ENUM('pending', 'active', 'deprecated', 'suspended');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"provider_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "endpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tool_id" uuid NOT NULL,
	"version_id" uuid,
	"url" text NOT NULL,
	"method" text DEFAULT 'POST' NOT NULL,
	"transport" "endpoint_transport" NOT NULL,
	"health_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invocations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tool_id" uuid,
	"tool_name" text NOT NULL,
	"version" text,
	"source" text NOT NULL,
	"success" boolean NOT NULL,
	"latency_ms" integer NOT NULL,
	"error_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"website_url" text,
	"identity_type" text DEFAULT 'domain' NOT NULL,
	"identity_value" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tool_id" uuid NOT NULL,
	"version" text NOT NULL,
	"changelog" text,
	"input_schema" jsonb,
	"output_schema" jsonb,
	"is_latest" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text,
	"capabilities" text[] DEFAULT '{}' NOT NULL,
	"protocol" "tool_protocol" NOT NULL,
	"provider_id" uuid NOT NULL,
	"status" "tool_status" DEFAULT 'pending' NOT NULL,
	"auth_requirement" "auth_requirement" DEFAULT 'none' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_scores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tool_id" uuid NOT NULL,
	"ownership_score" numeric(5, 4) DEFAULT '0' NOT NULL,
	"availability_score" numeric(5, 4) DEFAULT '0' NOT NULL,
	"compatibility_score" numeric(5, 4) DEFAULT '0' NOT NULL,
	"security_score" numeric(5, 4) DEFAULT '0' NOT NULL,
	"usage_score" numeric(5, 4) DEFAULT '0' NOT NULL,
	"overall_score" numeric(5, 4) DEFAULT '0' NOT NULL,
	"factors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"algorithm_version" text DEFAULT 'v1' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tool_id" uuid NOT NULL,
	"endpoint_id" uuid,
	"check_type" "check_type" NOT NULL,
	"status" "check_status" NOT NULL,
	"latency_ms" integer,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_version_id_tool_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."tool_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invocations" ADD CONSTRAINT "invocations_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_versions" ADD CONSTRAINT "tool_versions_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_scores" ADD CONSTRAINT "trust_scores_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_checks" ADD CONSTRAINT "verification_checks_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_checks" ADD CONSTRAINT "verification_checks_endpoint_id_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."endpoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_slug_uidx" ON "agents" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "endpoints_tool_idx" ON "endpoints" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "invocations_tool_name_idx" ON "invocations" USING btree ("tool_name","created_at");--> statement-breakpoint
CREATE INDEX "invocations_tool_id_idx" ON "invocations" USING btree ("tool_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "providers_slug_uidx" ON "providers" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_versions_tool_version_uidx" ON "tool_versions" USING btree ("tool_id","version");--> statement-breakpoint
CREATE INDEX "tool_versions_latest_idx" ON "tool_versions" USING btree ("tool_id","is_latest");--> statement-breakpoint
CREATE UNIQUE INDEX "tools_slug_uidx" ON "tools" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tools_protocol_idx" ON "tools" USING btree ("protocol");--> statement-breakpoint
CREATE INDEX "tools_category_idx" ON "tools" USING btree ("category");--> statement-breakpoint
CREATE INDEX "tools_status_idx" ON "tools" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "trust_scores_tool_uidx" ON "trust_scores" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "trust_scores_overall_idx" ON "trust_scores" USING btree ("overall_score");--> statement-breakpoint
CREATE INDEX "verification_checks_tool_idx" ON "verification_checks" USING btree ("tool_id","checked_at");--> statement-breakpoint
CREATE INDEX "verification_checks_type_idx" ON "verification_checks" USING btree ("check_type");