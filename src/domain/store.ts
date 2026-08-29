import type { z } from "zod"
import type {
  CatalogTool,
  InvocationEvent,
  RegisterToolRequest,
  ToolSearchQuery,
  ToolStatusSchema,
  TrustProfile,
  VerificationCheckRecord,
} from "./types.js"
import type { AgentRetentionSummary, ReliabilitySummary } from "./metrics.js"
import type { EvaluationMetricAttribution } from "./evaluation-metric-scopes.js"

export type ToolStatus = z.infer<typeof ToolStatusSchema>

export type UsageReceiptInput = {
  client_id?: string | null
  discovery_query?: Record<string, unknown> | null
  candidate_slugs?: string[]
  selected_slug?: string | null
  outcome?: "selected" | "invoked" | "success" | "failure" | "unknown"
  latency_ms?: number | null
  error_type?: string | null
  metadata?: Record<string, unknown>
}

export type RiskEvaluationContext = {
  action: "inspect" | "install" | "invoke"
  data_sensitivity: "public" | "internal" | "confidential" | "restricted"
  execution_mode: "supervised" | "unattended"
  permissions: Array<
    | "public_network"
    | "local_files_read"
    | "local_files_write"
    | "credentials"
    | "personal_data"
    | "code_execution"
    | "payments"
    | "destructive_actions"
  >
}

export type RiskEvaluationInput = {
  context: RiskEvaluationContext
}

export type RiskEvaluationOutcome = {
  action_taken: "proceeded" | "changed_tool" | "requested_review" | "aborted"
  result: "success" | "failure" | "not_executed" | "unknown"
  error_type:
    | "unavailable"
    | "authentication"
    | "timeout"
    | "validation"
    | "permission_denied"
    | "unsafe"
    | "wrong_tool"
    | "other"
    | null
  evidence_level: "self_reported" | "observed"
}

export type RiskEvaluationRecord = {
  id: string
  target_tool_id: string
  target: {
    id: string
    slug: string
    name: string
    protocol: "mcp" | "api" | "a2a"
    status: "pending" | "active" | "degraded" | "deprecated" | "suspended"
    provider: { slug: string; verified: boolean }
  }
  policy_version: string
  context: RiskEvaluationContext
  decision: "allow" | "review" | "block"
  confidence: number
  evidence_coverage: number
  reason_codes: string[]
  risk_factors: Array<{
    code: string
    severity: "low" | "medium" | "high" | "critical"
    explanation: string
  }>
  evidence: Array<{
    id: string
    kind: string
    status: "pass" | "warn" | "fail" | "unknown"
    source: string
    summary: string
    observed_at: string | null
  }>
  unknowns: string[]
  next_action: string
  outcome_token_hash: string
  agent_key: string | null
  agent_identity_kind: "explicit" | "anonymous" | "internal"
  client_name: string | null
  attribution_source: string | null
  is_external: boolean
  created_at: string
  expires_at: string
  outcome: RiskEvaluationOutcome | null
  outcome_reported_at: string | null
}

export type RiskEvaluationCohortSummary = {
  evaluations: number
  identified_external_agents: number
  decisions: { allow: number; review: number; block: number }
  reported_outcomes: number
  outcome_report_rate: number | null
  actions: {
    proceeded: number
    changed_tool: number
    requested_review: number
    aborted: number
  }
  results: {
    success: number
    failure: number
    not_executed: number
    unknown: number
  }
  behavior_changes: number
  behavior_change_rate: number | null
  policies: Array<{ policy_version: string; evaluations: number }>
}

export type RiskEvaluationSummary = RiskEvaluationCohortSummary &
  EvaluationMetricAttribution<RiskEvaluationCohortSummary> & {
    metric: "privacy_safe_agent_tool_risk_preflight"
    definition: string
    window_start: string
    generated_at: string
    external_evaluations: number
    evidence_notice: string
  }

export type PredictionMarketEvaluationOutcome = {
  action_taken:
    | "proceeded"
    | "reduced_position"
    | "changed_side"
    | "waited"
    | "requested_review"
    | "aborted"
  execution_result: "executed" | "not_executed" | "failed" | "unknown"
  failure_type:
    | "resolution_rules"
    | "liquidity"
    | "execution"
    | "data_quality"
    | "compliance"
    | "signal"
    | "other"
    | null
  evidence_level: "self_reported" | "observed"
}

export type PredictionMarketEvaluationRecord = {
  id: string
  platform: "polymarket"
  market_id: string
  market_slug: string
  market_question: string
  market_snapshot: {
    condition_id: string
    description: string
    resolution_source: string
    end_date: string | null
    updated_at: string | null
    active: boolean
    closed: boolean
    accepting_orders: boolean
    restricted: boolean
    outcomes: string[]
    prices: Array<number | null>
    token_ids: string[]
    best_bid: number | null
    best_ask: number | null
    spread: number | null
    liquidity_usd: number | null
  }
  policy_version: string
  intent: {
    intended_action: "observe" | "buy_yes" | "buy_no" | "sell_yes" | "sell_no"
    estimated_notional_usd: number | null
    execution_mode: "supervised" | "unattended"
    geographic_eligibility: "eligible" | "blocked" | "unknown"
  }
  decision: "allow" | "review" | "block"
  risk_score: number
  confidence: number
  reason_codes: string[]
  risk_factors: Array<{
    code: string
    severity: "low" | "medium" | "high" | "critical"
    explanation: string
  }>
  evidence: Array<{
    kind: string
    status: "pass" | "warn" | "fail" | "unknown"
    source: string
    summary: string
    observed_at: string | null
  }>
  unknowns: string[]
  depth: {
    available_notional_usd: number
    coverage_ratio: number | null
    estimated_average_price: number | null
    estimated_slippage_bps: number | null
    best_price: number | null
    observed_at: string | null
  } | null
  next_action: string
  snapshot_hash: string
  outcome_token_hash: string
  agent_key: string | null
  agent_identity_kind: "explicit" | "anonymous" | "internal"
  client_name: string | null
  attribution_source: string | null
  is_external: boolean
  created_at: string
  expires_at: string
  outcome: PredictionMarketEvaluationOutcome | null
  outcome_reported_at: string | null
}

export type PredictionMarketEvaluationCohortSummary = {
  evaluations: number
  identified_external_agents: number
  decisions: { allow: number; review: number; block: number }
  reported_outcomes: number
  outcome_report_rate: number | null
  behavior_changes: number
  behavior_change_rate: number | null
  top_reason_codes: Array<{ reason_code: string; evaluations: number }>
}

export type PredictionMarketEvaluationSummary =
  PredictionMarketEvaluationCohortSummary &
    EvaluationMetricAttribution<PredictionMarketEvaluationCohortSummary> & {
      metric: "privacy_safe_prediction_market_preflight"
      window_start: string
      generated_at: string
      external_evaluations: number
      evidence_notice: string
    }

export type AgentUsageSummary = {
  window_start: string
  generated_at: string
  target_external_agents: number
  identified_external_agents: number
  successful_external_invocations: number
  anonymous_successful_invocations: number
  progress_ratio: number
  retention: AgentRetentionSummary
  sources: Array<{
    source: string
    identified_agents: number
    successful_invocations: number
  }>
  clients: Array<{
    client: string
    identified_agents: number
    successful_invocations: number
  }>
}

export type ActivationStage =
  | "connect_view"
  | "install_click"
  | "mcp_initialize"
  | "tools_list"
  | "prompts_list"
  | "prompt_get"

export type ActivationEventInput = {
  stage: ActivationStage
  source: string
  client?: string | null
  agent_key?: string | null
  agent_identity_kind?: "explicit" | "anonymous" | "internal"
  is_external?: boolean
}

export type ActivationFunnelSummary = {
  window_start: string
  generated_at: string
  privacy: string
  stages: Array<{
    stage: ActivationStage | "tool_attempt" | "successful_tool" | "failed_tool"
    events: number
    identified_agents: number
    anonymous_external_events: number
  }>
  sources: Array<{
    source: string
    connect_views: number
    install_clicks: number
    initialize_events: number
    initialized_agents: number
    tools_list_events: number
    tools_listed_agents: number
    prompts_list_events: number
    prompts_listed_agents: number
    prompt_get_events: number
    prompt_get_agents: number
    prompt_activated_agents: number
    tool_call_events: number
    tool_call_agents: number
    failed_invocations: number
    failed_agents: number
    successful_invocations: number
    successful_agents: number
    tool_call_rate: number | null
    tool_success_rate: number | null
    prompt_activation_rate: number | null
    activation_rate: number | null
  }>
}

export type EnsureToolOptions = {
  status?: ToolStatus
  providerVerified?: boolean
}

export type ProviderRecord = {
  id: string
  slug: string
  name: string
  website_url: string | null
  identity_type: string
  identity_value: string
  verified: boolean
  metadata: Record<string, unknown>
}

/**
 * Persistence port for the ecosystem catalog.
 * Postgres for production; in-memory for tests and DB-less local runs.
 */
export interface CatalogStore {
  registerTool(input: RegisterToolRequest): Promise<CatalogTool>
  /**
   * Idempotent registration used for first-party seeding and re-deploys.
   * Creates when missing; updates mutable metadata when present.
   */
  ensureTool(
    input: RegisterToolRequest,
    options?: EnsureToolOptions
  ): Promise<CatalogTool>
  getToolBySlug(slug: string): Promise<CatalogTool | null>
  getToolById(id: string): Promise<CatalogTool | null>
  searchTools(query: ToolSearchQuery): Promise<CatalogTool[]>
  /**
   * Claim due tools for verification with a short lease (SKIP LOCKED semantics).
   * Prefer oldest last_verified / next_verify_at; skips tools still leased.
   */
  claimToolsForVerification(limit: number, leaseMs: number): Promise<string[]>
  /** @deprecated Prefer claimToolsForVerification */
  listToolIdsForVerification(limit?: number): Promise<string[]>
  completeVerificationAttempt(
    toolId: string,
    outcome: { success: boolean }
  ): Promise<{ failCount: number; successStreak: number }>
  recordUsageReceipt?(receipt: UsageReceiptInput): Promise<string>
  recordRiskEvaluation(evaluation: RiskEvaluationRecord): Promise<void>
  getRiskEvaluation(id: string): Promise<RiskEvaluationRecord | null>
  recordRiskEvaluationOutcome(input: {
    id: string
    outcome_token_hash: string
    outcome: RiskEvaluationOutcome
    reported_at: string
  }): Promise<"recorded" | "not_found" | "already_reported">
  riskEvaluationSummary(since?: Date): Promise<RiskEvaluationSummary>
  recordPredictionMarketEvaluation(
    evaluation: PredictionMarketEvaluationRecord
  ): Promise<void>
  getPredictionMarketEvaluation(
    id: string
  ): Promise<PredictionMarketEvaluationRecord | null>
  recordPredictionMarketEvaluationOutcome(input: {
    id: string
    outcome_token_hash: string
    outcome: PredictionMarketEvaluationOutcome
    reported_at: string
  }): Promise<"recorded" | "not_found" | "already_reported">
  predictionMarketEvaluationSummary(
    since?: Date
  ): Promise<PredictionMarketEvaluationSummary>
  getEndpointForTool(
    toolId: string
  ): Promise<{ id: string; url: string; transport: string } | null>
  insertVerificationCheck(
    check: Omit<VerificationCheckRecord, "id" | "checked_at"> & {
      checked_at?: string
    }
  ): Promise<VerificationCheckRecord>
  listVerificationChecks(
    toolId: string,
    limit?: number
  ): Promise<VerificationCheckRecord[]>
  upsertTrustProfile(toolId: string, profile: TrustProfile): Promise<void>
  recordActivationEvent(event: ActivationEventInput): Promise<void>
  activationFunnelSummary(since?: Date): Promise<ActivationFunnelSummary>
  recordInvocation(event: InvocationEvent): Promise<void>
  usageStats(
    toolId: string,
    sinceMs?: number
  ): Promise<{ invocations: number; successes: number }>
  agentUsageSummary(since?: Date): Promise<AgentUsageSummary>
  reliabilitySummary(since?: Date): Promise<ReliabilitySummary>
  getProviderBySlug(slug: string): Promise<ProviderRecord | null>
  getProviderByApiKeyHash(apiKeyHash: string): Promise<ProviderRecord | null>
  setProviderVerified(
    slug: string,
    verified: boolean,
    metadataPatch?: Record<string, unknown>
  ): Promise<ProviderRecord | null>
  setProviderMetadata(
    slug: string,
    metadata: Record<string, unknown>
  ): Promise<ProviderRecord | null>
  setToolStatus(toolId: string, status: ToolStatus): Promise<void>
}
