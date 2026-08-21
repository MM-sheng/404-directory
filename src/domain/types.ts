import { z } from "zod"

export const ToolProtocolSchema = z.enum(["mcp", "api", "a2a"])
export const AuthRequirementSchema = z.enum([
  "none",
  "api_key",
  "oauth",
  "other",
])
export const EndpointTransportSchema = z.enum([
  "http",
  "mcp_http",
  "mcp_stdio",
  "a2a",
])
export const ToolStatusSchema = z.enum([
  "pending",
  "active",
  "degraded",
  "deprecated",
  "suspended",
])
export const CheckTypeSchema = z.enum([
  "endpoint_availability",
  "mcp_handshake",
  "tools_list",
  "schema_consistency",
  "latency",
  "error_rate",
  "tls_security",
])
export const CheckStatusSchema = z.enum(["pass", "fail", "warn", "error"])

export const VerificationContractSchema = z
  .object({
    health_url: z.string().url().max(2_048).optional(),
    verification_url: z.string().url().max(2_048).optional(),
    manifest_url: z.string().url().max(2_048).optional(),
    expected_method: z.enum(["GET", "HEAD", "POST"]).default("GET"),
  })
  .strict()
  .optional()

export const ProviderIdentitySchema = z
  .object({
    type: z.enum(["domain", "github", "did", "email", "other"]),
    value: z.string().min(1).max(512),
  })
  .strict()

export const RegisterToolRequestSchema = z
  .object({
    name: z
      .string()
      .min(2)
      .max(128)
      .regex(/^[a-z][a-z0-9_:-]*$/i, "name must be slug-friendly"),
    description: z.string().min(8).max(4_000),
    capabilities: z.array(z.string().min(1).max(64)).min(1).max(32),
    protocol: ToolProtocolSchema,
    endpoint: z.string().url().max(2_048),
    category: z.string().min(1).max(64).optional(),
    version: z.string().min(1).max(64).default("0.1.0"),
    authentication: AuthRequirementSchema.default("none"),
    transport: EndpointTransportSchema.optional(),
    verification: VerificationContractSchema,
    provider: z
      .object({
        name: z.string().min(1).max(256),
        slug: z
          .string()
          .min(2)
          .max(128)
          .regex(/^[a-z0-9][a-z0-9_-]*$/)
          .optional(),
        website_url: z.string().url().optional(),
        identity: ProviderIdentitySchema,
      })
      .strict(),
    input_schema: z.record(z.string(), z.unknown()).optional(),
    output_schema: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.transport === "mcp_stdio") {
      ctx.addIssue({
        code: "custom",
        message:
          "mcp_stdio is not accepted for third-party registration; use remote mcp_http",
        path: ["transport"],
      })
    }
    if (data.protocol === "mcp" && data.transport === "mcp_stdio") {
      ctx.addIssue({
        code: "custom",
        message: "MCP tools must use mcp_http in this release",
        path: ["transport"],
      })
    }
    if (data.authentication !== "none") {
      const contract = data.verification
      if (!contract?.health_url && !contract?.verification_url) {
        ctx.addIssue({
          code: "custom",
          message:
            "Authenticated tools require verification.health_url or verification.verification_url (public probe; do not send production secrets)",
          path: ["verification"],
        })
      }
    }
  })

export type RegisterToolRequest = z.infer<typeof RegisterToolRequestSchema>

export const TrustProfileSchema = z
  .object({
    ownership_score: z.number().min(0).max(1),
    availability_score: z.number().min(0).max(1),
    compatibility_score: z.number().min(0).max(1),
    security_score: z.number().min(0).max(1),
    usage_score: z.number().min(0).max(1),
    overall_score: z.number().min(0).max(1),
    algorithm_version: z.string(),
    factors: z.record(z.string(), z.unknown()),
    computed_at: z.string(),
  })
  .strict()

export type TrustProfile = z.infer<typeof TrustProfileSchema>

export const ToolSearchQuerySchema = z
  .object({
    q: z.string().max(256).optional(),
    capability: z.string().max(64).optional(),
    protocol: ToolProtocolSchema.optional(),
    category: z.string().max(64).optional(),
    /** Default active — includes degraded (ranked lower). Pending quarantine. */
    status: z
      .enum(["active", "pending", "degraded", "deprecated", "suspended", "all"])
      .default("active"),
    trust_threshold: z.coerce.number().min(0).max(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict()

export type ToolSearchQuery = z.infer<typeof ToolSearchQuerySchema>

export type CatalogTool = {
  id: string
  slug: string
  name: string
  description: string
  category: string | null
  capabilities: string[]
  protocol: "mcp" | "api" | "a2a"
  status: "pending" | "active" | "degraded" | "deprecated" | "suspended"
  auth_requirement: "none" | "api_key" | "oauth" | "other"
  version: string | null
  endpoint: string | null
  metadata: Record<string, unknown>
  provider: {
    id: string
    slug: string
    name: string
    verified: boolean
  }
  trust: TrustProfile | null
  usage: {
    invocations_7d: number
    success_rate_7d: number | null
  }
  created_at: string
  updated_at: string
}

export type VerificationCheckRecord = {
  id: string
  tool_id: string
  endpoint_id: string | null
  check_type: z.infer<typeof CheckTypeSchema>
  status: z.infer<typeof CheckStatusSchema>
  latency_ms: number | null
  evidence: Record<string, unknown>
  checked_at: string
}

export type InvocationEvent = {
  tool_id?: string | null
  tool_name: string
  version?: string | null
  source: string
  success: boolean
  latency_ms: number
  error_type?: string | null
}
