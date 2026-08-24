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
