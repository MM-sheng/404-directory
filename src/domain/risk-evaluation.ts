import { createHash, randomBytes, randomUUID } from "node:crypto"
import { z } from "zod"
import { currentAgentAttribution } from "./agent-attribution.js"
import type {
  CatalogStore,
  RiskEvaluationInput,
  RiskEvaluationRecord,
} from "./store.js"
import { refreshTrustForTool } from "./trust.js"
import type { CatalogTool, VerificationCheckRecord } from "./types.js"

export const RISK_POLICY_VERSION = "tool-preflight-v1"
export const RISK_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1_000
export const RISK_RECEIPT_TTL_MS = 60 * 60 * 1_000

export const RiskActionSchema = z.enum(["inspect", "install", "invoke"])
export const RiskDataSensitivitySchema = z.enum([
  "public",
  "internal",
  "confidential",
  "restricted",
])
export const RiskExecutionModeSchema = z.enum(["supervised", "unattended"])
export const RiskPermissionSchema = z.enum([
  "public_network",
  "local_files_read",
  "local_files_write",
  "credentials",
  "personal_data",
  "code_execution",
  "payments",
  "destructive_actions",
])

export const EvaluateToolRiskRequestSchema = z
  .object({
    target: z
      .string()
      .min(1)
      .max(128)
      .describe("404.directory catalog tool UUID or slug."),
    action: RiskActionSchema.describe(
      "The next action the Agent is considering: inspect, install, or invoke."
    ),
    data_sensitivity: RiskDataSensitivitySchema.default("public").describe(
      "Highest sensitivity of data the Agent may expose to the tool."
    ),
    execution_mode: RiskExecutionModeSchema.default("supervised").describe(
      "Whether a human supervises this action or it runs unattended."
    ),
    permissions: z
      .array(RiskPermissionSchema)
      .max(8)
      .default([])
      .describe(
        "Permissions or side effects needed for this action. Include every applicable value."
      ),
  })
  .strict()

export type EvaluateToolRiskRequest = z.infer<
  typeof EvaluateToolRiskRequestSchema
>

export const EvaluationOutcomeRequestSchema = z
  .object({
    outcome_token: z.string().min(32).max(128),
    action_taken: z.enum([
      "proceeded",
      "changed_tool",
      "requested_review",
      "aborted",
    ]),
    result: z.enum(["success", "failure", "not_executed", "unknown"]),
    error_type: z
      .enum([
        "unavailable",
        "authentication",
        "timeout",
        "validation",
        "permission_denied",
        "unsafe",
        "wrong_tool",
        "other",
      ])
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.result !== "failure" && value.error_type) {
      context.addIssue({
        code: "custom",
        path: ["error_type"],
        message: "error_type is accepted only when result is failure",
      })
    }
  })

export type EvaluationOutcomeRequest = z.infer<
  typeof EvaluationOutcomeRequestSchema
>

export type RiskDecision = "allow" | "review" | "block"
export type RiskEvidenceStatus = "pass" | "warn" | "fail" | "unknown"

export type RiskEvidence = {
  id: string
  kind: string
  status: RiskEvidenceStatus
  source: string
  summary: string
  observed_at: string | null
}

export type RiskEvaluationPublic = {
  receipt_id: string
  policy_version: string
  target: {
    id: string
    slug: string
    name: string
    protocol: CatalogTool["protocol"]
    status: CatalogTool["status"]
    provider: {
      slug: string
      verified: boolean
    }
  }
  context: RiskEvaluationInput["context"]
  decision: RiskDecision
  confidence: number
  evidence_coverage: number
  reason_codes: string[]
  risk_factors: Array<{
    code: string
    severity: "low" | "medium" | "high" | "critical"
    explanation: string
  }>
  evidence: RiskEvidence[]
  unknowns: string[]
  next_action: string
  evaluated_at: string
  expires_at: string
  limitations: string[]
}

export type RiskEvaluationCreated = RiskEvaluationPublic & {
  outcome_token: string
  outcome_reporting: {
    mcp_tool: "report_tool_outcome"
    rest_endpoint: string
    privacy: string
  }
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function latestChecks(
  checks: VerificationCheckRecord[]
): Map<string, VerificationCheckRecord> {
  const latest = new Map<string, VerificationCheckRecord>()
  for (const check of checks) {
    const existing = latest.get(check.check_type)
    if (
      !existing ||
      new Date(check.checked_at).getTime() >
        new Date(existing.checked_at).getTime()
    ) {
      latest.set(check.check_type, check)
    }
  }
  return latest
}

function checkEvidence(
  check: VerificationCheckRecord,
  nowMs: number
): RiskEvidence {
  const ageMs = nowMs - new Date(check.checked_at).getTime()
  const stale = !Number.isFinite(ageMs) || ageMs > RISK_EVIDENCE_MAX_AGE_MS
  const status: RiskEvidenceStatus = stale
    ? "warn"
    : check.status === "pass"
      ? "pass"
      : check.status === "warn"
        ? "warn"
        : "fail"
  return {
    id: `check:${check.id}`,
    kind: check.check_type,
    status,
    source: "404.directory verification worker",
    summary: stale
      ? `${check.check_type} evidence is older than 24 hours.`
      : `${check.check_type} most recently returned ${check.status}.`,
    observed_at: check.checked_at,
  }
}

function publicEvaluation(record: RiskEvaluationRecord): RiskEvaluationPublic {
  return {
    receipt_id: record.id,
    policy_version: record.policy_version,
    target: record.target,
    context: record.context,
    decision: record.decision,
    confidence: record.confidence,
    evidence_coverage: record.evidence_coverage,
    reason_codes: record.reason_codes,
    risk_factors: record.risk_factors,
    evidence: record.evidence,
    unknowns: record.unknowns,
    next_action: record.next_action,
    evaluated_at: record.created_at,
    expires_at: record.expires_at,
    limitations: [
      "This is a contextual evidence-based preflight decision, not a guarantee of security, availability, or fitness.",
      "Confidence measures the completeness and strength of the cited evidence under this policy; it is not a calibrated probability of success or safety.",
      "404.directory does not inspect secrets, private payloads, or the result of an execution in this evaluation.",
      "Self-reported outcomes are stored separately and do not directly increase Trust scores.",
    ],
  }
}

async function resolveAnyCatalogTool(
  store: CatalogStore,
  target: string
): Promise<CatalogTool | null> {
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      target
    )
  ) {
    return store.getToolById(target)
  }
  return store.getToolBySlug(target)
}

export class UnknownRiskTargetError extends Error {
  constructor(target: string) {
    super(`Unknown catalog tool: ${target}`)
    this.name = "UnknownRiskTargetError"
  }
}

export class InvalidRiskReceiptError extends Error {
  constructor() {
    super("Receipt or outcome token was not found.")
    this.name = "InvalidRiskReceiptError"
  }
}

export async function evaluateToolRisk(
  store: CatalogStore,
  rawInput: EvaluateToolRiskRequest,
  publicBaseUrl = "https://404.directory"
): Promise<RiskEvaluationCreated> {
  const input = EvaluateToolRiskRequestSchema.parse(rawInput)
  const permissions = [...new Set(input.permissions)]
  const tool = await resolveAnyCatalogTool(store, input.target)
  if (!tool) throw new UnknownRiskTargetError(input.target)

  const [checks, refreshedTrust] = await Promise.all([
    store.listVerificationChecks(tool.id, 50),
    refreshTrustForTool(store, tool.id),
  ])
  const trust = refreshedTrust ?? tool.trust
  const now = new Date()
  const nowMs = now.getTime()
  const latest = latestChecks(checks)
  const requiredChecks =
    tool.protocol === "mcp"
      ? [
          "endpoint_availability",
          "mcp_handshake",
          "tools_list",
          "schema_consistency",
          "tls_security",
        ]
      : ["endpoint_availability", "tls_security"]

  const evidence: RiskEvidence[] = [
    {
      id: `provider:${tool.provider.slug}`,
      kind: "provider_ownership",
      status: tool.provider.verified ? "pass" : "unknown",
      source: "404.directory provider registry",
      summary: tool.provider.verified
        ? "Provider ownership is verified by 404.directory."
        : "Provider ownership has not been verified by 404.directory.",
      observed_at: null,
    },
    {
      id: `lifecycle:${tool.id}`,
      kind: "catalog_lifecycle",
      status:
        tool.status === "active"
          ? "pass"
          : tool.status === "suspended"
            ? "fail"
            : "warn",
      source: "404.directory catalog",
      summary: `Catalog lifecycle status is ${tool.status}.`,
      observed_at: tool.updated_at,
    },
  ]

  const unknowns: string[] = []
  for (const checkType of requiredChecks) {
    const check = latest.get(checkType)
    if (check) evidence.push(checkEvidence(check, nowMs))
    else {
      evidence.push({
        id: `missing:${checkType}`,
        kind: checkType,
        status: "unknown",
        source: "404.directory verification worker",
        summary: `No ${checkType} evidence is available.`,
        observed_at: null,
      })
      unknowns.push(`Missing ${checkType} evidence.`)
    }
  }

  evidence.push({
    id: `usage:${tool.id}`,
    kind: "observed_usage",
    status:
      tool.usage.invocations_7d === 0
        ? "unknown"
        : (tool.usage.success_rate_7d ?? 0) >= 0.9
          ? "pass"
          : "warn",
    source: "404.directory privacy-safe invocation telemetry",
    summary:
      tool.usage.invocations_7d === 0
        ? "No observed executions in the last 7 days."
        : `${tool.usage.invocations_7d} observed executions in 7 days with ${Math.round((tool.usage.success_rate_7d ?? 0) * 100)}% success.`,
    observed_at: null,
  })

  const evaluatedEvidence = evidence.filter(
    (item) => item.kind !== "observed_usage"
  )
  const covered = evaluatedEvidence.filter(
    (item) => item.status !== "unknown"
  ).length
  const evidenceCoverage = Number(
    (covered / Math.max(1, evaluatedEvidence.length)).toFixed(4)
  )
  const riskFactors: RiskEvaluationPublic["risk_factors"] = []
  const reasonCodes = new Set<string>()
  let decision: RiskDecision = "allow"

  const addRisk = (
    code: string,
    severity: "low" | "medium" | "high" | "critical",
    explanation: string,
    requiredDecision: RiskDecision
  ) => {
    reasonCodes.add(code)
    riskFactors.push({ code, severity, explanation })
    if (requiredDecision === "block" || decision === "allow") {
      decision = requiredDecision
    }
  }

  if (tool.status === "suspended") {
    addRisk(
      "TARGET_SUSPENDED",
      "critical",
      "The catalog suspended this tool after lifecycle or security failures.",
      "block"
    )
  } else if (tool.status !== "active") {
    addRisk(
      "TARGET_NOT_ACTIVE",
      "high",
      `The target is ${tool.status}, not active.`,
      tool.status === "pending" ? "block" : "review"
    )
  }

  const unsupportedPermissions = permissions.filter((permission) =>
    [
      "local_files_write",
      "credentials",
      "code_execution",
      "payments",
      "destructive_actions",
    ].includes(permission)
  )
  if (unsupportedPermissions.length > 0) {
    addRisk(
      "HIGH_RISK_PERMISSION_OUT_OF_SCOPE",
      "critical",
      `404.directory has not established safety for: ${unsupportedPermissions.join(", ")}.`,
      "block"
    )
  }
  const elevatedPermissions = permissions.filter((permission) =>
    ["local_files_read", "personal_data"].includes(permission)
  )
  if (elevatedPermissions.length > 0) {
    addRisk(
      "ELEVATED_PERMISSION_REQUIRES_REVIEW",
      "high",
      `Current public evidence is insufficient for: ${elevatedPermissions.join(", ")}.`,
      "review"
    )
  }
  if (input.data_sensitivity === "restricted") {
    addRisk(
      "RESTRICTED_DATA_OUT_OF_SCOPE",
      "critical",
      "Restricted data must not be sent to a public third-party tool.",
      "block"
    )
  } else if (
    input.data_sensitivity === "internal" ||
    input.data_sensitivity === "confidential"
  ) {
    addRisk(
      "NON_PUBLIC_DATA_REQUIRES_REVIEW",
      "high",
      "The current evidence does not establish a data-processing agreement or private-data boundary.",
      "review"
    )
  }

  if (!tool.provider.verified) {
    addRisk(
      "PROVIDER_UNVERIFIED",
      "high",
      "Provider ownership is not verified.",
      "review"
    )
  }
  if (tool.auth_requirement !== "none") {
    addRisk(
      "AUTHENTICATION_REQUIRED",
      "medium",
      "The tool requires credentials or delegated authorization that this preflight does not inspect.",
      "review"
    )
  }

  const recentFailures = [...latest.values()].filter((check) => {
    const age = nowMs - new Date(check.checked_at).getTime()
    return (
      age <= RISK_EVIDENCE_MAX_AGE_MS &&
      ["fail", "error"].includes(check.status)
    )
  })
  if (recentFailures.some((check) => check.check_type === "tls_security")) {
    addRisk(
      "RECENT_SECURITY_FAILURE",
      "critical",
      "A recent TLS security check failed.",
      "block"
    )
  } else if (recentFailures.length > 0) {
    addRisk(
      "RECENT_VERIFICATION_FAILURE",
      "high",
      `Recent checks failed: ${recentFailures.map((check) => check.check_type).join(", ")}.`,
      "review"
    )
  }

  const staleChecks = [...latest.values()].filter(
    (check) =>
      nowMs - new Date(check.checked_at).getTime() > RISK_EVIDENCE_MAX_AGE_MS
  )
  if (unknowns.length > 0) {
    addRisk(
      "EVIDENCE_INCOMPLETE",
      "medium",
      "Required verification evidence is missing.",
      "review"
    )
  }
  if (staleChecks.length > 0) {
    unknowns.push("One or more verification checks are older than 24 hours.")
    addRisk(
      "EVIDENCE_STALE",
      "medium",
      "One or more verification checks are stale.",
      "review"
    )
  }
  if ((trust?.overall_score ?? 0) < 0.7) {
    addRisk(
      "TRUST_SIGNAL_BELOW_ALLOW_THRESHOLD",
      "medium",
      "The composite trust signal is below the conservative allow threshold.",
      "review"
    )
  }
  if (tool.usage.invocations_7d < 3) {
    unknowns.push("There is limited recent execution history for this tool.")
    reasonCodes.add("LIMITED_OBSERVED_USAGE")
  }
  if (
    input.execution_mode === "unattended" &&
    (permissions.some((permission) => permission !== "public_network") ||
      input.data_sensitivity !== "public")
  ) {
    addRisk(
      "UNATTENDED_HIGHER_ASSURANCE_REQUIRED",
      "high",
      "Unattended use with non-public data or broader permissions requires human review.",
      "review"
    )
  }

  if (decision === "allow") reasonCodes.add("LOW_RISK_PREFLIGHT_PASSED")
  const confidence = Number(
    Math.max(
      0.1,
      Math.min(
        0.99,
        evidenceCoverage * 0.7 +
          (tool.provider.verified ? 0.15 : 0) +
          (tool.usage.invocations_7d >= 3 ? 0.15 : 0)
      )
    ).toFixed(4)
  )
  const outcomeToken = randomBytes(32).toString("base64url")
  const attribution = currentAgentAttribution()
  const createdAt = now.toISOString()
  const expiresAt = new Date(nowMs + RISK_RECEIPT_TTL_MS).toISOString()
  const nextAction =
    decision === "allow"
      ? "Proceed with the minimum necessary permissions, then report the observed outcome using this receipt."
      : decision === "review"
        ? "Pause execution, inspect the listed risks and unknowns, then obtain human approval or choose a better-evidenced tool."
        : "Do not install or invoke this target in the stated context; remove the blocked condition or choose another tool."

  const record: RiskEvaluationRecord = {
    id: randomUUID(),
    target_tool_id: tool.id,
    target: {
      id: tool.id,
      slug: tool.slug,
      name: tool.name,
      protocol: tool.protocol,
      status: tool.status,
      provider: {
        slug: tool.provider.slug,
        verified: tool.provider.verified,
      },
    },
    policy_version: RISK_POLICY_VERSION,
    context: {
      action: input.action,
      data_sensitivity: input.data_sensitivity,
      execution_mode: input.execution_mode,
      permissions,
    },
    decision,
    confidence,
    evidence_coverage: evidenceCoverage,
    reason_codes: [...reasonCodes],
    risk_factors: riskFactors,
    evidence,
    unknowns: [...new Set(unknowns)],
    next_action: nextAction,
    outcome_token_hash: tokenHash(outcomeToken),
    agent_key: attribution?.agent_key ?? null,
    agent_identity_kind: attribution?.agent_identity_kind ?? "anonymous",
    client_name: attribution?.client_name ?? null,
    attribution_source: attribution?.attribution_source ?? "direct",
    is_external: attribution?.is_external ?? false,
    created_at: createdAt,
    expires_at: expiresAt,
    outcome: null,
    outcome_reported_at: null,
  }
  await store.recordRiskEvaluation(record)

  return {
    ...publicEvaluation(record),
    outcome_token: outcomeToken,
    outcome_reporting: {
      mcp_tool: "report_tool_outcome",
      rest_endpoint: `${publicBaseUrl.replace(/\/$/, "")}/v1/evaluations/${record.id}/outcome`,
      privacy:
        "Report only the bounded action/result enums. Do not send prompts, arguments, outputs, secrets, or personal data.",
    },
  }
}

export async function getRiskEvaluationReceipt(
  store: CatalogStore,
  id: string
): Promise<
  (RiskEvaluationPublic & { outcome: RiskEvaluationRecord["outcome"] }) | null
> {
  const record = await store.getRiskEvaluation(id)
  return record
    ? { ...publicEvaluation(record), outcome: record.outcome }
    : null
}

export async function reportRiskEvaluationOutcome(
  store: CatalogStore,
  receiptId: string,
  rawOutcome: EvaluationOutcomeRequest
): Promise<"recorded" | "not_found" | "already_reported"> {
  const outcome = EvaluationOutcomeRequestSchema.parse(rawOutcome)
  return store.recordRiskEvaluationOutcome({
    id: receiptId,
    outcome_token_hash: tokenHash(outcome.outcome_token),
    outcome: {
      action_taken: outcome.action_taken,
      result: outcome.result,
      error_type: outcome.error_type ?? null,
      evidence_level: "self_reported",
    },
    reported_at: new Date().toISOString(),
  })
}
