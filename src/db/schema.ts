import { randomUUID } from "node:crypto"
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

export const toolProtocolEnum = pgEnum("tool_protocol", ["mcp", "api", "a2a"])
export const toolStatusEnum = pgEnum("tool_status", [
  "pending",
  "active",
  "degraded",
  "deprecated",
  "suspended",
])
export const authRequirementEnum = pgEnum("auth_requirement", [
  "none",
  "api_key",
  "oauth",
  "other",
])
export const endpointTransportEnum = pgEnum("endpoint_transport", [
  "http",
  "mcp_http",
  "mcp_stdio",
  "a2a",
])
export const checkStatusEnum = pgEnum("check_status", [
  "pass",
  "fail",
  "warn",
  "error",
])
export const checkTypeEnum = pgEnum("check_type", [
  "endpoint_availability",
  "mcp_handshake",
  "tools_list",
  "schema_consistency",
  "latency",
  "error_rate",
  "tls_security",
])

export const providers = pgTable(
  "providers",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    websiteUrl: text("website_url"),
    identityType: text("identity_type").notNull().default("domain"),
    identityValue: text("identity_value").notNull(),
    verified: boolean("verified").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("providers_slug_uidx").on(table.slug)]
)

export const agents = pgTable(
  "agents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    providerId: uuid("provider_id").references(() => providers.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("agents_slug_uidx").on(table.slug)]
)

export const tools = pgTable(
  "tools",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category"),
    capabilities: text("capabilities").array().notNull().default([]),
    protocol: toolProtocolEnum("protocol").notNull(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    status: toolStatusEnum("status").notNull().default("pending"),
    authRequirement: authRequirementEnum("auth_requirement")
      .notNull()
      .default("none"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    nextVerifyAt: timestamp("next_verify_at", { withTimezone: true }),
    verifyLeaseUntil: timestamp("verify_lease_until", { withTimezone: true }),
    verifyFailCount: integer("verify_fail_count").notNull().default(0),
    verifySuccessStreak: integer("verify_success_streak").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("tools_slug_uidx").on(table.slug),
    index("tools_protocol_idx").on(table.protocol),
    index("tools_category_idx").on(table.category),
    index("tools_status_idx").on(table.status),
    index("tools_next_verify_idx").on(table.nextVerifyAt),
  ]
)

export const toolVersions = pgTable(
  "tool_versions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    changelog: text("changelog"),
    inputSchema: jsonb("input_schema").$type<Record<string, unknown>>(),
    outputSchema: jsonb("output_schema").$type<Record<string, unknown>>(),
    isLatest: boolean("is_latest").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("tool_versions_tool_version_uidx").on(
      table.toolId,
      table.version
    ),
    index("tool_versions_latest_idx").on(table.toolId, table.isLatest),
  ]
)

export const endpoints = pgTable(
  "endpoints",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => toolVersions.id, {
      onDelete: "set null",
    }),
    url: text("url").notNull(),
    method: text("method").notNull().default("POST"),
    transport: endpointTransportEnum("transport").notNull(),
    healthPath: text("health_path"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("endpoints_tool_idx").on(table.toolId)]
)

export const verificationChecks = pgTable(
  "verification_checks",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id").references(() => endpoints.id, {
      onDelete: "set null",
    }),
    checkType: checkTypeEnum("check_type").notNull(),
    status: checkStatusEnum("status").notNull(),
    latencyMs: integer("latency_ms"),
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("verification_checks_tool_idx").on(table.toolId, table.checkedAt),
    index("verification_checks_type_idx").on(table.checkType),
  ]
)

export const trustScores = pgTable(
  "trust_scores",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    ownershipScore: numeric("ownership_score", { precision: 5, scale: 4 })
      .notNull()
      .default("0"),
    availabilityScore: numeric("availability_score", {
      precision: 5,
      scale: 4,
    })
      .notNull()
      .default("0"),
    compatibilityScore: numeric("compatibility_score", {
      precision: 5,
      scale: 4,
    })
      .notNull()
      .default("0"),
    securityScore: numeric("security_score", { precision: 5, scale: 4 })
      .notNull()
      .default("0"),
    usageScore: numeric("usage_score", { precision: 5, scale: 4 })
      .notNull()
      .default("0"),
    overallScore: numeric("overall_score", { precision: 5, scale: 4 })
      .notNull()
      .default("0"),
    factors: jsonb("factors")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    algorithmVersion: text("algorithm_version").notNull().default("v1"),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("trust_scores_tool_uidx").on(table.toolId),
    index("trust_scores_overall_idx").on(table.overallScore),
  ]
)

export const invocations = pgTable(
  "invocations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    toolId: uuid("tool_id").references(() => tools.id, {
      onDelete: "set null",
    }),
    toolName: text("tool_name").notNull(),
    version: text("version"),
    source: text("source").notNull(),
    success: boolean("success").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    errorType: text("error_type"),
    agentKey: text("agent_key"),
    agentIdentityKind: text("agent_identity_kind"),
    clientName: text("client_name"),
    attributionSource: text("attribution_source"),
    isExternal: boolean("is_external").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("invocations_tool_name_idx").on(table.toolName, table.createdAt),
    index("invocations_tool_id_idx").on(table.toolId, table.createdAt),
    index("invocations_agent_key_idx").on(table.agentKey, table.createdAt),
    index("invocations_external_idx").on(
      table.isExternal,
      table.success,
      table.createdAt
    ),
  ]
)

/**
 * Privacy-safe activation funnel events. No IP address, raw Agent ID, prompt,
 * request arguments, or tool result is stored here.
 */
export const activationEvents = pgTable(
  "activation_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    stage: text("stage").notNull(),
    source: text("source").notNull(),
    client: text("client"),
    agentKey: text("agent_key"),
    agentIdentityKind: text("agent_identity_kind")
      .notNull()
      .default("anonymous"),
    isExternal: boolean("is_external").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("activation_events_stage_idx").on(table.stage, table.createdAt),
    index("activation_events_source_idx").on(table.source, table.createdAt),
    index("activation_events_agent_idx").on(table.agentKey, table.createdAt),
  ]
)

/**
 * Append-only usage receipts: discovery → selection → outcome.
 * Never stores prompts or business payload content.
 */
export const usageReceipts = pgTable(
  "usage_receipts",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    clientId: text("client_id"),
    discoveryQuery: jsonb("discovery_query").$type<Record<string, unknown>>(),
    candidateSlugs: text("candidate_slugs").array().notNull().default([]),
    selectedSlug: text("selected_slug"),
    outcome: text("outcome").notNull().default("unknown"),
    latencyMs: integer("latency_ms"),
    errorType: text("error_type"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("usage_receipts_created_idx").on(table.createdAt),
    index("usage_receipts_selected_idx").on(table.selectedSlug, table.createdAt),
  ]
)

export type ProviderRow = typeof providers.$inferSelect
export type ToolRow = typeof tools.$inferSelect
export type ToolVersionRow = typeof toolVersions.$inferSelect
export type EndpointRow = typeof endpoints.$inferSelect
export type VerificationCheckRow = typeof verificationChecks.$inferSelect
export type TrustScoreRow = typeof trustScores.$inferSelect
export type InvocationRow = typeof invocations.$inferSelect
export type ActivationEventRow = typeof activationEvents.$inferSelect
export type UsageReceiptRow = typeof usageReceipts.$inferSelect
