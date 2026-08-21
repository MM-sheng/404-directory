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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("invocations_tool_name_idx").on(table.toolName, table.createdAt),
    index("invocations_tool_id_idx").on(table.toolId, table.createdAt),
  ]
)

export type ProviderRow = typeof providers.$inferSelect
export type ToolRow = typeof tools.$inferSelect
export type ToolVersionRow = typeof toolVersions.$inferSelect
export type EndpointRow = typeof endpoints.$inferSelect
export type VerificationCheckRow = typeof verificationChecks.$inferSelect
export type TrustScoreRow = typeof trustScores.$inferSelect
export type InvocationRow = typeof invocations.$inferSelect
