import { randomUUID } from "node:crypto"
import type {
  ActivationEventInput,
  ActivationFunnelSummary,
  AgentUsageSummary,
  CatalogStore,
  EnsureToolOptions,
  ProviderRecord,
  ToolStatus,
  UsageReceiptInput,
} from "./store.js"
import type {
  CatalogTool,
  InvocationEvent,
  RegisterToolRequest,
  ToolSearchQuery,
  TrustProfile,
  VerificationCheckRecord,
} from "./types.js"
import {
  buildAgentRetention,
  buildReliabilitySummary,
  type ReliabilitySummary,
} from "./metrics.js"
import { nextVerifyBackoffMs } from "./verification.js"
import { isDiscoverableStatus } from "./lifecycle.js"

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function toolMetadata(input: RegisterToolRequest): Record<string, unknown> {
  return {
    ...(input.metadata ?? {}),
    ...(input.verification ? { verification: input.verification } : {}),
  }
}

type MemoryProvider = ProviderRecord

type MemoryTool = CatalogTool & {
  endpoint_id: string
  endpoint_url: string
  transport: string
  last_verified_at: number | null
  next_verify_at: number | null
  verify_lease_until: number | null
  verify_fail_count: number
  verify_success_streak: number
}

/**
 * In-memory catalog for tests and when DATABASE_URL is unset.
 * Enables Discovery/Trust APIs locally without Postgres.
 */
export class MemoryCatalogStore implements CatalogStore {
  private readonly providers = new Map<string, MemoryProvider>()
  private readonly tools = new Map<string, MemoryTool>()
  private readonly byId = new Map<string, MemoryTool>()
  private readonly checks: VerificationCheckRecord[] = []
  private readonly invocations: Array<
    InvocationEvent & { created_at: number }
  > = []
  private readonly activationEvents: Array<
    ActivationEventInput & { created_at: number }
  > = []
  private readonly receipts: Array<UsageReceiptInput & { id: string }> = []

  async registerTool(input: RegisterToolRequest): Promise<CatalogTool> {
    const slug = slugify(input.name)
    if (this.tools.has(slug)) {
      throw new Error(`Tool already registered: ${slug}`)
    }
    return this.createTool(input, { status: "pending" })
  }

  async ensureTool(
    input: RegisterToolRequest,
    options: EnsureToolOptions = {}
  ): Promise<CatalogTool> {
    const slug = slugify(input.name)
    const existing = this.tools.get(slug)
    if (!existing) {
      return this.createTool(input, options)
    }

    const now = new Date().toISOString()
    existing.description = input.description
    existing.capabilities = input.capabilities
    existing.category = input.category ?? existing.category
    existing.version = input.version
    existing.endpoint = input.endpoint
    existing.endpoint_url = input.endpoint
    existing.auth_requirement = input.authentication
    existing.protocol = input.protocol
    existing.metadata = toolMetadata(input)
    if (options.status) existing.status = options.status
    existing.updated_at = now

    const transport =
      input.transport ??
      (input.protocol === "mcp"
        ? "mcp_http"
        : input.protocol === "a2a"
          ? "a2a"
          : "http")
    if (transport === "mcp_stdio") {
      throw new Error("mcp_stdio is not accepted for registration")
    }
    existing.transport = transport

    const providerSlug = input.provider.slug ?? slugify(input.provider.name)
    const provider = this.providers.get(providerSlug)
    if (provider && options.providerVerified !== undefined) {
      provider.verified = options.providerVerified
      existing.provider.verified = options.providerVerified
      if (options.providerVerified) {
        provider.metadata = {
          ...provider.metadata,
          ownership_method: "first_party",
        }
      }
    }

    return this.toPublic(await this.withUsage(existing))
  }

  async getToolBySlug(slug: string): Promise<CatalogTool | null> {
    const tool = this.tools.get(slugify(slug))
    return tool ? this.toPublic(await this.withUsage(tool)) : null
  }

  async getToolById(id: string): Promise<CatalogTool | null> {
    const tool = this.byId.get(id)
    return tool ? this.toPublic(await this.withUsage(tool)) : null
  }

  async searchTools(query: ToolSearchQuery): Promise<CatalogTool[]> {
    const q = query.q?.toLowerCase()
    const capability = query.capability?.toLowerCase()
    const statusFilter = query.status ?? "active"
    const results: MemoryTool[] = []

    for (const tool of this.tools.values()) {
      if (statusFilter === "active" && !isDiscoverableStatus(tool.status)) {
        continue
      }
      if (
        statusFilter !== "all" &&
        statusFilter !== "active" &&
        tool.status !== statusFilter
      ) {
        continue
      }
      if (statusFilter === "all" && tool.status === "suspended") continue
      if (query.protocol && tool.protocol !== query.protocol) continue
      if (query.category && tool.category !== query.category) continue
      if (
        capability &&
        !tool.capabilities.some((c) => c.toLowerCase().includes(capability))
      ) {
        continue
      }
      if (q) {
        const hay =
          `${tool.name} ${tool.description} ${tool.capabilities.join(" ")}`.toLowerCase()
        if (!hay.includes(q)) continue
      }
      const withUsage = await this.withUsage(tool)
      if (
        query.trust_threshold !== undefined &&
        (withUsage.trust?.overall_score ?? 0) < query.trust_threshold
      ) {
        continue
      }
      results.push(withUsage)
    }

    results.sort((a, b) => {
      const statusPenalty = (tool: MemoryTool) =>
        tool.status === "degraded" ? 0.15 : 0
      const trustDelta =
        (b.trust?.overall_score ?? 0) -
        statusPenalty(b) -
        ((a.trust?.overall_score ?? 0) - statusPenalty(a))
      if (trustDelta !== 0) return trustDelta
      return b.usage.invocations_7d - a.usage.invocations_7d
    })

    return results.slice(0, query.limit).map((t) => this.toPublic(t))
  }

  async listToolIdsForVerification(limit = 50): Promise<string[]> {
    return this.claimToolsForVerification(limit, 60_000)
  }

  async claimToolsForVerification(
    limit = 50,
    leaseMs = 60_000
  ): Promise<string[]> {
    const now = Date.now()
    const candidates = [...this.byId.values()]
      .filter(
        (tool) =>
          (tool.status === "pending" ||
            tool.status === "active" ||
            tool.status === "degraded" ||
            tool.status === "suspended") &&
          (tool.verify_lease_until == null || tool.verify_lease_until <= now) &&
          (tool.next_verify_at == null || tool.next_verify_at <= now)
      )
      .sort((a, b) => {
        const aNext = a.next_verify_at ?? 0
        const bNext = b.next_verify_at ?? 0
        if (aNext !== bNext) return aNext - bNext
        return (a.last_verified_at ?? 0) - (b.last_verified_at ?? 0)
      })
      .slice(0, limit)

    for (const tool of candidates) {
      tool.verify_lease_until = now + leaseMs
    }
    return candidates.map((tool) => tool.id)
  }

  async completeVerificationAttempt(
    toolId: string,
    outcome: { success: boolean }
  ): Promise<{ failCount: number; successStreak: number }> {
    const tool = this.byId.get(toolId)
    if (!tool) return { failCount: 0, successStreak: 0 }
    const now = Date.now()
    tool.last_verified_at = now
    tool.verify_lease_until = null
    if (outcome.success) {
      tool.verify_fail_count = 0
      tool.verify_success_streak += 1
      tool.next_verify_at = now + 30 * 60_000
    } else {
      tool.verify_fail_count += 1
      tool.verify_success_streak = 0
      tool.next_verify_at = now + nextVerifyBackoffMs(tool.verify_fail_count)
    }
    return {
      failCount: tool.verify_fail_count,
      successStreak: tool.verify_success_streak,
    }
  }

  async recordUsageReceipt(receipt: UsageReceiptInput): Promise<string> {
    const id = randomUUID()
    this.receipts.push({ ...receipt, id })
    return id
  }

  async getEndpointForTool(
    toolId: string
  ): Promise<{ id: string; url: string; transport: string } | null> {
    const tool = this.byId.get(toolId)
    if (!tool) return null
    return {
      id: tool.endpoint_id,
      url: tool.endpoint_url,
      transport: tool.transport,
    }
  }

  async insertVerificationCheck(
    check: Omit<VerificationCheckRecord, "id" | "checked_at"> & {
      checked_at?: string
    }
  ): Promise<VerificationCheckRecord> {
    const record: VerificationCheckRecord = {
      id: randomUUID(),
      tool_id: check.tool_id,
      endpoint_id: check.endpoint_id,
      check_type: check.check_type,
      status: check.status,
      latency_ms: check.latency_ms,
      evidence: check.evidence,
      checked_at: check.checked_at ?? new Date().toISOString(),
    }
    this.checks.unshift(record)
    return record
  }

  async listVerificationChecks(
    toolId: string,
    limit = 20
  ): Promise<VerificationCheckRecord[]> {
    return this.checks.filter((c) => c.tool_id === toolId).slice(0, limit)
  }

  async upsertTrustProfile(
    toolId: string,
    profile: TrustProfile
  ): Promise<void> {
    const tool = this.byId.get(toolId)
    if (!tool) return
    tool.trust = profile
    tool.updated_at = new Date().toISOString()
  }

  async recordActivationEvent(event: ActivationEventInput): Promise<void> {
    this.activationEvents.push({ ...event, created_at: Date.now() })
  }

  async activationFunnelSummary(
    since = new Date("2026-01-01T00:00:00.000Z")
  ): Promise<ActivationFunnelSummary> {
    const sinceMs = since.getTime()
    const events = this.activationEvents.filter(
      (event) => event.created_at >= sinceMs
    )
    const attempted = this.invocations.filter(
      (event) => event.created_at >= sinceMs && event.is_external === true
    )
    const successful = attempted.filter((event) => event.success)
    const failed = attempted.filter((event) => !event.success)
    const stageOrder = [
      "connect_view",
      "install_click",
      "mcp_initialize",
      "tools_list",
    ] as const
    const stages: ActivationFunnelSummary["stages"] = stageOrder.map(
      (stage) => {
        const rows = events.filter((event) => event.stage === stage)
        return {
          stage,
          events: rows.length,
          identified_agents: new Set(
            rows
              .filter(
                (event) =>
                  event.is_external === true &&
                  event.agent_identity_kind === "explicit" &&
                  event.agent_key
              )
              .map((event) => event.agent_key!)
          ).size,
          anonymous_external_events: rows.filter(
            (event) =>
              event.is_external === true &&
              event.agent_identity_kind === "anonymous"
          ).length,
        }
      }
    )
    const invocationStage = (
      stage: "tool_attempt" | "successful_tool" | "failed_tool",
      rows: typeof attempted
    ): ActivationFunnelSummary["stages"][number] => ({
      stage,
      events: rows.length,
      identified_agents: new Set(
        rows
          .filter(
            (event) =>
              event.agent_identity_kind === "explicit" && event.agent_key
          )
          .map((event) => event.agent_key!)
      ).size,
      anonymous_external_events: rows.filter(
        (event) =>
          event.agent_identity_kind === undefined ||
          event.agent_identity_kind === null ||
          event.agent_identity_kind === "anonymous"
      ).length,
    })
    stages.push(invocationStage("tool_attempt", attempted))
    stages.push(invocationStage("successful_tool", successful))
    stages.push(invocationStage("failed_tool", failed))

    const sourceMap = new Map<
      string,
      ActivationFunnelSummary["sources"][number]
    >()
    const sourceEntry = (source?: string | null) => {
      const key = source ?? "direct"
      const existing = sourceMap.get(key)
      if (existing) return existing
      const created = {
        source: key,
        connect_views: 0,
        install_clicks: 0,
        initialize_events: 0,
        initialized_agents: 0,
        tools_list_events: 0,
        tools_listed_agents: 0,
        tool_call_events: 0,
        tool_call_agents: 0,
        failed_invocations: 0,
        failed_agents: 0,
        successful_invocations: 0,
        successful_agents: 0,
        tool_call_rate: null,
        tool_success_rate: null,
        activation_rate: null,
      }
      sourceMap.set(key, created)
      return created
    }
    for (const event of events) {
      const source = sourceEntry(event.source)
      if (event.stage === "connect_view") source.connect_views += 1
      if (event.stage === "install_click") source.install_clicks += 1
      if (event.stage === "mcp_initialize") source.initialize_events += 1
      if (event.stage === "tools_list") source.tools_list_events += 1
    }
    for (const stage of ["mcp_initialize", "tools_list"] as const) {
      const bySource = new Map<string, Set<string>>()
      for (const event of events) {
        if (
          event.stage !== stage ||
          event.is_external !== true ||
          event.agent_identity_kind !== "explicit" ||
          !event.agent_key
        ) {
          continue
        }
        const agents = bySource.get(event.source) ?? new Set<string>()
        agents.add(event.agent_key)
        bySource.set(event.source, agents)
      }
      for (const [source, agents] of bySource) {
        const entry = sourceEntry(source)
        if (stage === "mcp_initialize") entry.initialized_agents = agents.size
        else entry.tools_listed_agents = agents.size
      }
    }
    for (const rows of [attempted, successful, failed]) {
      const agentsBySource = new Map<string, Set<string>>()
      for (const event of rows) {
        const source = event.attribution_source ?? "direct"
        const entry = sourceEntry(source)
        if (rows === attempted) entry.tool_call_events += 1
        if (rows === successful) entry.successful_invocations += 1
        if (rows === failed) entry.failed_invocations += 1
        if (event.agent_identity_kind !== "explicit" || !event.agent_key) {
          continue
        }
        const agents = agentsBySource.get(source) ?? new Set<string>()
        agents.add(event.agent_key)
        agentsBySource.set(source, agents)
      }
      for (const [source, agents] of agentsBySource) {
        const entry = sourceEntry(source)
        if (rows === attempted) entry.tool_call_agents = agents.size
        if (rows === successful) entry.successful_agents = agents.size
        if (rows === failed) entry.failed_agents = agents.size
      }
    }

    for (const source of sourceMap.values()) {
      source.tool_call_rate =
        source.initialized_agents > 0
          ? Number(
              (source.tool_call_agents / source.initialized_agents).toFixed(4)
            )
          : null
      source.tool_success_rate =
        source.tool_call_agents > 0
          ? Number(
              (source.successful_agents / source.tool_call_agents).toFixed(4)
            )
          : null
      source.activation_rate =
        source.initialized_agents > 0
          ? Number(
              (source.successful_agents / source.initialized_agents).toFixed(4)
            )
          : null
    }

    return {
      window_start: since.toISOString(),
      generated_at: new Date().toISOString(),
      privacy:
        "Stores only funnel stage, source, client label, external classification, and an optional irreversible Agent ID HMAC. No raw IDs, IPs, prompts, arguments, or results.",
      stages,
      sources: [...sourceMap.values()].sort(
        (a, b) =>
          b.successful_agents - a.successful_agents ||
          b.successful_invocations - a.successful_invocations ||
          b.tool_call_agents - a.tool_call_agents ||
          b.tool_call_events - a.tool_call_events ||
          b.initialized_agents - a.initialized_agents ||
          b.initialize_events - a.initialize_events ||
          b.install_clicks - a.install_clicks ||
          b.connect_views - a.connect_views
      ),
    }
  }

  async recordInvocation(event: InvocationEvent): Promise<void> {
    this.invocations.push({ ...event, created_at: Date.now() })
  }

  async usageStats(
    toolId: string,
    sinceMs = 7 * 24 * 60 * 60 * 1000
  ): Promise<{ invocations: number; successes: number }> {
    const since = Date.now() - sinceMs
    const rows = this.invocations.filter(
      (row) => row.tool_id === toolId && row.created_at >= since
    )
    return {
      invocations: rows.length,
      successes: rows.filter((row) => row.success).length,
    }
  }

  async agentUsageSummary(
    since = new Date("2026-01-01T00:00:00.000Z")
  ): Promise<AgentUsageSummary> {
    const rows = this.invocations.filter(
      (row) => row.created_at >= since.getTime() && row.success
    )
    const explicit = rows.filter(
      (row) =>
        row.is_external === true &&
        row.agent_identity_kind === "explicit" &&
        Boolean(row.agent_key)
    )
    const agents = new Set(explicit.map((row) => row.agent_key!))
    const bySource = new Map<
      string,
      { agents: Set<string>; invocations: number }
    >()
    const byClient = new Map<
      string,
      { agents: Set<string>; invocations: number }
    >()
    for (const row of explicit) {
      const source = row.attribution_source ?? "direct"
      const current = bySource.get(source) ?? {
        agents: new Set<string>(),
        invocations: 0,
      }
      current.agents.add(row.agent_key!)
      current.invocations += 1
      bySource.set(source, current)

      const client = row.client_name ?? "unknown-client"
      const clientCurrent = byClient.get(client) ?? {
        agents: new Set<string>(),
        invocations: 0,
      }
      clientCurrent.agents.add(row.agent_key!)
      clientCurrent.invocations += 1
      byClient.set(client, clientCurrent)
    }
    return {
      window_start: since.toISOString(),
      generated_at: new Date().toISOString(),
      target_external_agents: 1_000,
      identified_external_agents: agents.size,
      successful_external_invocations: explicit.length,
      anonymous_successful_invocations: rows.filter(
        (row) =>
          row.is_external === true &&
          (row.agent_identity_kind === undefined ||
            row.agent_identity_kind === null ||
            row.agent_identity_kind === "anonymous")
      ).length,
      progress_ratio: Number(Math.min(1, agents.size / 1_000).toFixed(4)),
      retention: buildAgentRetention(rows),
      sources: [...bySource.entries()]
        .map(([source, value]) => ({
          source,
          identified_agents: value.agents.size,
          successful_invocations: value.invocations,
        }))
        .sort((a, b) => b.identified_agents - a.identified_agents),
      clients: [...byClient.entries()]
        .map(([client, value]) => ({
          client,
          identified_agents: value.agents.size,
          successful_invocations: value.invocations,
        }))
        .sort(
          (a, b) =>
            b.identified_agents - a.identified_agents ||
            b.successful_invocations - a.successful_invocations
        ),
    }
  }

  async reliabilitySummary(
    since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ): Promise<ReliabilitySummary> {
    return buildReliabilitySummary(
      this.invocations.map((row) => {
        const tool = row.tool_id ? this.byId.get(row.tool_id) : undefined
        return {
          ...row,
          provider_slug: tool?.provider.slug ?? null,
          provider_name: tool?.provider.name ?? null,
        }
      }),
      since
    )
  }

  async getProviderBySlug(slug: string): Promise<ProviderRecord | null> {
    return this.providers.get(slugify(slug)) ?? null
  }

  async getProviderByApiKeyHash(
    apiKeyHash: string
  ): Promise<ProviderRecord | null> {
    for (const provider of this.providers.values()) {
      if (provider.metadata.api_key_hash === apiKeyHash) {
        return { ...provider }
      }
    }
    return null
  }

  async setProviderVerified(
    slug: string,
    verified: boolean,
    metadataPatch?: Record<string, unknown>
  ): Promise<ProviderRecord | null> {
    const provider = this.providers.get(slugify(slug))
    if (!provider) return null
    provider.verified = verified
    if (metadataPatch) {
      provider.metadata = { ...provider.metadata, ...metadataPatch }
    }
    for (const tool of this.tools.values()) {
      if (tool.provider.slug === provider.slug) {
        tool.provider.verified = verified
      }
    }
    return { ...provider }
  }

  async setProviderMetadata(
    slug: string,
    metadata: Record<string, unknown>
  ): Promise<ProviderRecord | null> {
    const provider = this.providers.get(slugify(slug))
    if (!provider) return null
    provider.metadata = metadata
    return { ...provider }
  }

  async setToolStatus(toolId: string, status: ToolStatus): Promise<void> {
    const tool = this.byId.get(toolId)
    if (!tool) return
    tool.status = status
    tool.updated_at = new Date().toISOString()
  }

  private async createTool(
    input: RegisterToolRequest,
    options: EnsureToolOptions
  ): Promise<CatalogTool> {
    const slug = slugify(input.name)
    const now = new Date().toISOString()
    const providerSlug = input.provider.slug ?? slugify(input.provider.name)
    const id = randomUUID()
    const endpointId = randomUUID()
    const transport =
      input.transport ??
      (input.protocol === "mcp"
        ? "mcp_http"
        : input.protocol === "a2a"
          ? "a2a"
          : "http")
    if (transport === "mcp_stdio") {
      throw new Error("mcp_stdio is not accepted for registration")
    }

    let provider = this.providers.get(providerSlug)
    if (!provider) {
      provider = {
        id: randomUUID(),
        slug: providerSlug,
        name: input.provider.name,
        website_url: input.provider.website_url ?? null,
        identity_type: input.provider.identity.type,
        identity_value: input.provider.identity.value,
        verified: options.providerVerified ?? false,
        metadata:
          options.providerVerified === true
            ? { ownership_method: "first_party" }
            : {},
      }
      this.providers.set(providerSlug, provider)
    } else if (options.providerVerified !== undefined) {
      provider.verified = options.providerVerified
      if (options.providerVerified) {
        provider.metadata = {
          ...provider.metadata,
          ownership_method: "first_party",
        }
      }
    }

    const tool: MemoryTool = {
      id,
      slug,
      name: input.name,
      description: input.description,
      category: input.category ?? null,
      capabilities: input.capabilities,
      protocol: input.protocol,
      status: options.status ?? "pending",
      auth_requirement: input.authentication,
      version: input.version,
      endpoint: input.endpoint,
      endpoint_id: endpointId,
      endpoint_url: input.endpoint,
      transport,
      last_verified_at: null,
      next_verify_at: null,
      verify_lease_until: null,
      verify_fail_count: 0,
      verify_success_streak: 0,
      provider: {
        id: provider.id,
        slug: provider.slug,
        name: provider.name,
        verified: provider.verified,
      },
      trust: null,
      usage: { invocations_7d: 0, success_rate_7d: null },
      metadata: toolMetadata(input),
      created_at: now,
      updated_at: now,
    }

    this.tools.set(slug, tool)
    this.byId.set(id, tool)
    return this.toPublic(tool)
  }

  private async withUsage(tool: MemoryTool): Promise<MemoryTool> {
    const stats = await this.usageStats(tool.id)
    return {
      ...tool,
      usage: {
        invocations_7d: stats.invocations,
        success_rate_7d:
          stats.invocations === 0
            ? null
            : Number((stats.successes / stats.invocations).toFixed(4)),
      },
    }
  }

  private toPublic(tool: MemoryTool): CatalogTool {
    return {
      id: tool.id,
      slug: tool.slug,
      name: tool.name,
      description: tool.description,
      category: tool.category,
      capabilities: tool.capabilities,
      protocol: tool.protocol,
      status: tool.status,
      auth_requirement: tool.auth_requirement,
      version: tool.version,
      endpoint: tool.endpoint,
      metadata: tool.metadata ?? {},
      provider: tool.provider,
      trust: tool.trust,
      usage: tool.usage,
      created_at: tool.created_at,
      updated_at: tool.updated_at,
    }
  }
}
