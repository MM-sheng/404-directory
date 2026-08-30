import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm"
import type { Database } from "../db/client.js"
import {
  activationEvents,
  endpoints,
  invocations,
  predictionMarketEvaluations,
  providers,
  riskEvaluations,
  tools,
  toolVersions,
  trustScores,
  usageReceipts,
  verifiedAgentAdmissions,
  verificationChecks,
} from "../db/schema.js"
import type {
  ActivationEventInput,
  ActivationFunnelSummary,
  AgentUsageSummary,
  CatalogStore,
  EnsureToolOptions,
  PredictionMarketEvaluationOutcome,
  PredictionMarketEvaluationRecord,
  ProviderRecord,
  RiskEvaluationRecord,
  RiskEvaluationOutcome,
  ToolStatus,
  UsageReceiptInput,
  VerifiedAgentAdmissionInput,
  VerifiedAgentAdmissionRecord,
  VerifiedAgentEvidenceSummary,
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
import { buildRiskEvaluationSummary } from "./risk-metrics.js"
import { buildPredictionMarketEvaluationSummary } from "./prediction-market-metrics.js"
import { rankSearchCandidates } from "./catalog-search.js"

function toolMetadata(input: RegisterToolRequest): Record<string, unknown> {
  return {
    ...(input.metadata ?? {}),
    ...(input.verification ? { verification: input.verification } : {}),
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  return typeof value === "number" ? value : Number(value)
}

export class PostgresCatalogStore implements CatalogStore {
  constructor(private readonly db: Database) {}

  async registerTool(input: RegisterToolRequest): Promise<CatalogTool> {
    const slug = slugify(input.name)
    const providerSlug = input.provider.slug ?? slugify(input.provider.name)
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

    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: tools.id })
        .from(tools)
        .where(eq(tools.slug, slug))
        .limit(1)
      if (existing[0]) {
        throw new Error(`Tool already registered: ${slug}`)
      }

      let provider = await tx
        .select()
        .from(providers)
        .where(eq(providers.slug, providerSlug))
        .limit(1)
        .then((rows) => rows[0])

      if (!provider) {
        const inserted = await tx
          .insert(providers)
          .values({
            slug: providerSlug,
            name: input.provider.name,
            websiteUrl: input.provider.website_url,
            identityType: input.provider.identity.type,
            identityValue: input.provider.identity.value,
            metadata: {},
          })
          .returning()
        provider = inserted[0]!
      }

      const [tool] = await tx
        .insert(tools)
        .values({
          slug,
          name: input.name,
          description: input.description,
          category: input.category,
          capabilities: input.capabilities,
          protocol: input.protocol,
          providerId: provider.id,
          status: "pending",
          authRequirement: input.authentication,
          metadata: toolMetadata(input),
        })
        .returning()

      const [version] = await tx
        .insert(toolVersions)
        .values({
          toolId: tool!.id,
          version: input.version,
          inputSchema: input.input_schema,
          outputSchema: input.output_schema,
          isLatest: true,
        })
        .returning()

      await tx.insert(endpoints).values({
        toolId: tool!.id,
        versionId: version!.id,
        url: input.endpoint,
        method: input.verification?.expected_method ?? "POST",
        transport,
      })

      return (await this.hydrateTool(tool!.id, tx as unknown as Database))!
    })
  }

  async ensureTool(
    input: RegisterToolRequest,
    options: EnsureToolOptions = {}
  ): Promise<CatalogTool> {
    const slug = slugify(input.name)
    const existing = await this.getToolBySlug(slug)
    if (!existing) {
      const created = await this.registerTool(input)
      if (options.status) await this.setToolStatus(created.id, options.status)
      if (options.providerVerified !== undefined) {
        const providerSlug = input.provider.slug ?? slugify(input.provider.name)
        await this.setProviderVerified(providerSlug, options.providerVerified, {
          ownership_method: "first_party",
        })
      }
      if (options.status || options.providerVerified !== undefined) {
        return (await this.getToolById(created.id)) ?? created
      }
      return created
    }

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

    return this.db.transaction(async (tx) => {
      await tx
        .update(tools)
        .set({
          description: input.description,
          capabilities: input.capabilities,
          category: input.category,
          authRequirement: input.authentication,
          protocol: input.protocol,
          status: options.status ?? existing.status,
          metadata: toolMetadata(input),
          updatedAt: new Date(),
        })
        .where(eq(tools.id, existing.id))

      await tx
        .update(toolVersions)
        .set({ isLatest: false })
        .where(eq(toolVersions.toolId, existing.id))

      const existingVersion = await tx
        .select({ id: toolVersions.id })
        .from(toolVersions)
        .where(
          and(
            eq(toolVersions.toolId, existing.id),
            eq(toolVersions.version, input.version)
          )
        )
        .limit(1)
        .then((rows) => rows[0])

      let versionId: string
      if (existingVersion) {
        await tx
          .update(toolVersions)
          .set({
            inputSchema: input.input_schema,
            outputSchema: input.output_schema,
            isLatest: true,
          })
          .where(eq(toolVersions.id, existingVersion.id))
        versionId = existingVersion.id
      } else {
        const [inserted] = await tx
          .insert(toolVersions)
          .values({
            toolId: existing.id,
            version: input.version,
            inputSchema: input.input_schema,
            outputSchema: input.output_schema,
            isLatest: true,
          })
          .returning({ id: toolVersions.id })
        versionId = inserted!.id
      }

      const endpoint = await tx
        .select({ id: endpoints.id })
        .from(endpoints)
        .where(eq(endpoints.toolId, existing.id))
        .limit(1)
        .then((rows) => rows[0])

      if (endpoint) {
        await tx
          .update(endpoints)
          .set({
            url: input.endpoint,
            transport,
            method: input.verification?.expected_method ?? "POST",
            versionId,
          })
          .where(eq(endpoints.id, endpoint.id))
      } else {
        await tx.insert(endpoints).values({
          toolId: existing.id,
          versionId,
          url: input.endpoint,
          method: input.verification?.expected_method ?? "POST",
          transport,
        })
      }

      if (options.providerVerified !== undefined) {
        const providerSlug = input.provider.slug ?? slugify(input.provider.name)
        await tx
          .update(providers)
          .set({
            verified: options.providerVerified,
            metadata: sql`coalesce(${providers.metadata}, '{}'::jsonb) || ${JSON.stringify({ ownership_method: "first_party" })}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(providers.slug, providerSlug))
      }

      return (await this.hydrateTool(existing.id, tx as unknown as Database))!
    })
  }

  async getProviderBySlug(slug: string): Promise<ProviderRecord | null> {
    const row = await this.db
      .select()
      .from(providers)
      .where(eq(providers.slug, slugify(slug)))
      .limit(1)
      .then((rows) => rows[0])
    if (!row) return null
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      website_url: row.websiteUrl,
      identity_type: row.identityType,
      identity_value: row.identityValue,
      verified: row.verified,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    }
  }

  async getProviderByApiKeyHash(
    apiKeyHash: string
  ): Promise<ProviderRecord | null> {
    const rows = await this.db.select().from(providers)
    for (const row of rows) {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>
      if (metadata.api_key_hash === apiKeyHash) {
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          website_url: row.websiteUrl,
          identity_type: row.identityType,
          identity_value: row.identityValue,
          verified: row.verified,
          metadata,
        }
      }
    }
    return null
  }

  async setProviderVerified(
    slug: string,
    verified: boolean,
    metadataPatch?: Record<string, unknown>
  ): Promise<ProviderRecord | null> {
    const current = await this.getProviderBySlug(slug)
    if (!current) return null
    const metadata = { ...current.metadata, ...(metadataPatch ?? {}) }
    const [row] = await this.db
      .update(providers)
      .set({
        verified,
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(providers.slug, slugify(slug)))
      .returning()
    if (!row) return null
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      website_url: row.websiteUrl,
      identity_type: row.identityType,
      identity_value: row.identityValue,
      verified: row.verified,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    }
  }

  async setProviderMetadata(
    slug: string,
    metadata: Record<string, unknown>
  ): Promise<ProviderRecord | null> {
    const [row] = await this.db
      .update(providers)
      .set({ metadata, updatedAt: new Date() })
      .where(eq(providers.slug, slugify(slug)))
      .returning()
    if (!row) return null
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      website_url: row.websiteUrl,
      identity_type: row.identityType,
      identity_value: row.identityValue,
      verified: row.verified,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    }
  }

  async setToolStatus(toolId: string, status: ToolStatus): Promise<void> {
    await this.db
      .update(tools)
      .set({ status, updatedAt: new Date() })
      .where(eq(tools.id, toolId))
  }

  async getToolBySlug(slug: string): Promise<CatalogTool | null> {
    const row = await this.db
      .select({ id: tools.id })
      .from(tools)
      .where(eq(tools.slug, slugify(slug)))
      .limit(1)
    return row[0] ? this.hydrateTool(row[0].id) : null
  }

  async getToolById(id: string): Promise<CatalogTool | null> {
    return this.hydrateTool(id)
  }

  async searchTools(query: ToolSearchQuery): Promise<CatalogTool[]> {
    const statusFilter = query.status ?? "active"
    const conditions = []
    if (statusFilter === "active") {
      conditions.push(sql`${tools.status} IN ('active', 'degraded')`)
    } else if (statusFilter === "all") {
      conditions.push(sql`${tools.status} <> 'suspended'`)
    } else {
      conditions.push(sql`${tools.status} = ${statusFilter}`)
    }
    if (query.protocol) {
      conditions.push(sql`${tools.protocol} = ${query.protocol}`)
    }
    if (query.category) {
      conditions.push(sql`${tools.category} = ${query.category}`)
    }
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    // Rank lightweight metadata with the same matcher as memory. Do not truncate
    // before relevance/trust filtering or hydrate every candidate's full receipt.
    const rows = await this.db
      .select({
        id: tools.id,
        slug: tools.slug,
        name: tools.name,
        description: tools.description,
        capabilities: tools.capabilities,
        category: tools.category,
        protocol: tools.protocol,
        status: tools.status,
        providerName: providers.name,
        providerSlug: providers.slug,
        overallScore: trustScores.overallScore,
        invocations7d: sql<number>`(SELECT count(*)::int FROM ${invocations}
          WHERE ${invocations.toolId} = ${tools.id} AND ${invocations.createdAt} >= ${since.toISOString()}::timestamptz)`,
      })
      .from(tools)
      .innerJoin(providers, eq(tools.providerId, providers.id))
      .leftJoin(trustScores, eq(trustScores.toolId, tools.id))
      .where(and(...conditions))
    const ranked = rankSearchCandidates(
      rows.map((row) => ({
        ...row,
        provider: { name: row.providerName, slug: row.providerSlug },
        trust:
          row.overallScore === null
            ? null
            : { overall_score: num(row.overallScore) },
        usage: { invocations_7d: Number(row.invocations7d) },
      })),
      query
    )
    const hydrated = await Promise.all(
      ranked.map((row) => this.hydrateTool(row.id))
    )
    // Recheck lifecycle and thresholds if an entry changed while being hydrated.
    return rankSearchCandidates(
      hydrated.filter((tool): tool is CatalogTool => tool !== null),
      query
    )
  }

  async listToolIdsForVerification(limit = 50): Promise<string[]> {
    return this.claimToolsForVerification(limit, 60_000)
  }

  async claimToolsForVerification(
    limit = 50,
    leaseMs = 60_000
  ): Promise<string[]> {
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + leaseMs)

    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: tools.id })
        .from(tools)
        .where(
          and(
            sql`${tools.status} IN ('pending', 'active', 'degraded', 'suspended')`,
            or(
              isNull(tools.verifyLeaseUntil),
              lte(tools.verifyLeaseUntil, now)
            ),
            or(isNull(tools.nextVerifyAt), lte(tools.nextVerifyAt, now))
          )
        )
        .orderBy(
          sql`${tools.nextVerifyAt} ASC NULLS FIRST`,
          sql`${tools.lastVerifiedAt} ASC NULLS FIRST`
        )
        .limit(limit)
        .for("update", { skipLocked: true })

      for (const row of rows) {
        await tx
          .update(tools)
          .set({ verifyLeaseUntil: leaseUntil })
          .where(eq(tools.id, row.id))
      }
      return rows.map((row) => row.id)
    })
  }

  async completeVerificationAttempt(
    toolId: string,
    outcome: { success: boolean }
  ): Promise<{ failCount: number; successStreak: number }> {
    const now = new Date()
    const current = await this.db
      .select({
        failCount: tools.verifyFailCount,
        successStreak: tools.verifySuccessStreak,
      })
      .from(tools)
      .where(eq(tools.id, toolId))
      .limit(1)
      .then((rows) => rows[0])

    const failCount = outcome.success ? 0 : (current?.failCount ?? 0) + 1
    const successStreak = outcome.success
      ? (current?.successStreak ?? 0) + 1
      : 0
    const delayMs = outcome.success
      ? 30 * 60_000
      : nextVerifyBackoffMs(failCount)

    await this.db
      .update(tools)
      .set({
        lastVerifiedAt: now,
        verifyLeaseUntil: null,
        verifyFailCount: failCount,
        verifySuccessStreak: successStreak,
        nextVerifyAt: new Date(now.getTime() + delayMs),
        updatedAt: now,
      })
      .where(eq(tools.id, toolId))

    return { failCount, successStreak }
  }

  async recordUsageReceipt(receipt: UsageReceiptInput): Promise<string> {
    const [row] = await this.db
      .insert(usageReceipts)
      .values({
        clientId: receipt.client_id ?? null,
        discoveryQuery: receipt.discovery_query ?? null,
        candidateSlugs: receipt.candidate_slugs ?? [],
        selectedSlug: receipt.selected_slug ?? null,
        outcome: receipt.outcome ?? "unknown",
        latencyMs: receipt.latency_ms ?? null,
        errorType: receipt.error_type ?? null,
        metadata: receipt.metadata ?? {},
      })
      .returning({ id: usageReceipts.id })
    return row!.id
  }

  async recordRiskEvaluation(evaluation: RiskEvaluationRecord): Promise<void> {
    await this.db.insert(riskEvaluations).values({
      id: evaluation.id,
      targetToolId: evaluation.target_tool_id,
      targetSnapshot: evaluation.target,
      policyVersion: evaluation.policy_version,
      context: evaluation.context,
      decision: evaluation.decision,
      confidence: String(evaluation.confidence),
      evidenceCoverage: String(evaluation.evidence_coverage),
      reasonCodes: evaluation.reason_codes,
      riskFactors: evaluation.risk_factors,
      evidence: evaluation.evidence,
      unknowns: evaluation.unknowns,
      nextAction: evaluation.next_action,
      outcomeTokenHash: evaluation.outcome_token_hash,
      agentKey: evaluation.agent_key,
      agentIdentityKind: evaluation.agent_identity_kind,
      clientName: evaluation.client_name,
      attributionSource: evaluation.attribution_source,
      isExternal: evaluation.is_external,
      createdAt: new Date(evaluation.created_at),
      expiresAt: new Date(evaluation.expires_at),
    })
  }

  async getRiskEvaluation(id: string): Promise<RiskEvaluationRecord | null> {
    const row = await this.db
      .select()
      .from(riskEvaluations)
      .where(eq(riskEvaluations.id, id))
      .limit(1)
      .then((rows) => rows[0])
    if (!row) return null
    return {
      id: row.id,
      target_tool_id: row.targetToolId,
      target: row.targetSnapshot as RiskEvaluationRecord["target"],
      policy_version: row.policyVersion,
      context: row.context as RiskEvaluationRecord["context"],
      decision: row.decision as RiskEvaluationRecord["decision"],
      confidence: num(row.confidence),
      evidence_coverage: num(row.evidenceCoverage),
      reason_codes: row.reasonCodes,
      risk_factors: row.riskFactors as RiskEvaluationRecord["risk_factors"],
      evidence: row.evidence as RiskEvaluationRecord["evidence"],
      unknowns: row.unknowns,
      next_action: row.nextAction,
      outcome_token_hash: row.outcomeTokenHash,
      agent_key: row.agentKey,
      agent_identity_kind:
        row.agentIdentityKind as RiskEvaluationRecord["agent_identity_kind"],
      client_name: row.clientName,
      attribution_source: row.attributionSource,
      is_external: row.isExternal,
      created_at: row.createdAt.toISOString(),
      expires_at: row.expiresAt.toISOString(),
      outcome: row.outcome as RiskEvaluationOutcome | null,
      outcome_reported_at: row.outcomeReportedAt?.toISOString() ?? null,
    }
  }

  async recordRiskEvaluationOutcome(input: {
    id: string
    outcome_token_hash: string
    outcome: RiskEvaluationOutcome
    reported_at: string
  }): Promise<"recorded" | "not_found" | "already_reported"> {
    const updated = await this.db
      .update(riskEvaluations)
      .set({
        outcome: input.outcome,
        outcomeReportedAt: new Date(input.reported_at),
      })
      .where(
        and(
          eq(riskEvaluations.id, input.id),
          eq(riskEvaluations.outcomeTokenHash, input.outcome_token_hash),
          isNull(riskEvaluations.outcome)
        )
      )
      .returning({ id: riskEvaluations.id })
    if (updated[0]) return "recorded"
    const existing = await this.getRiskEvaluation(input.id)
    if (!existing || existing.outcome_token_hash !== input.outcome_token_hash) {
      return "not_found"
    }
    return "already_reported"
  }

  async riskEvaluationSummary(since = new Date("2026-01-01T00:00:00.000Z")) {
    const ids = await this.db
      .select({ id: riskEvaluations.id })
      .from(riskEvaluations)
      .where(gte(riskEvaluations.createdAt, since))
    const records = (
      await Promise.all(ids.map((row) => this.getRiskEvaluation(row.id)))
    ).filter((record): record is RiskEvaluationRecord => Boolean(record))
    return buildRiskEvaluationSummary(records, since)
  }

  async recordPredictionMarketEvaluation(
    evaluation: PredictionMarketEvaluationRecord
  ): Promise<void> {
    await this.db.insert(predictionMarketEvaluations).values({
      id: evaluation.id,
      platform: evaluation.platform,
      marketId: evaluation.market_id,
      marketSlug: evaluation.market_slug,
      marketQuestion: evaluation.market_question,
      marketSnapshot: evaluation.market_snapshot,
      policyVersion: evaluation.policy_version,
      intent: evaluation.intent,
      decision: evaluation.decision,
      riskScore: evaluation.risk_score,
      confidence: String(evaluation.confidence),
      reasonCodes: evaluation.reason_codes,
      riskFactors: evaluation.risk_factors,
      evidence: evaluation.evidence,
      unknowns: evaluation.unknowns,
      depth: evaluation.depth,
      nextAction: evaluation.next_action,
      snapshotHash: evaluation.snapshot_hash,
      outcomeTokenHash: evaluation.outcome_token_hash,
      agentKey: evaluation.agent_key,
      agentIdentityKind: evaluation.agent_identity_kind,
      clientName: evaluation.client_name,
      attributionSource: evaluation.attribution_source,
      isExternal: evaluation.is_external,
      createdAt: new Date(evaluation.created_at),
      expiresAt: new Date(evaluation.expires_at),
    })
  }

  async getPredictionMarketEvaluation(
    id: string
  ): Promise<PredictionMarketEvaluationRecord | null> {
    const row = await this.db
      .select()
      .from(predictionMarketEvaluations)
      .where(eq(predictionMarketEvaluations.id, id))
      .limit(1)
      .then((rows) => rows[0])
    if (!row) return null
    return {
      id: row.id,
      platform: row.platform as "polymarket",
      market_id: row.marketId,
      market_slug: row.marketSlug,
      market_question: row.marketQuestion,
      market_snapshot:
        row.marketSnapshot as PredictionMarketEvaluationRecord["market_snapshot"],
      policy_version: row.policyVersion,
      intent: row.intent as PredictionMarketEvaluationRecord["intent"],
      decision: row.decision as PredictionMarketEvaluationRecord["decision"],
      risk_score: row.riskScore,
      confidence: num(row.confidence),
      reason_codes: row.reasonCodes,
      risk_factors:
        row.riskFactors as PredictionMarketEvaluationRecord["risk_factors"],
      evidence: row.evidence as PredictionMarketEvaluationRecord["evidence"],
      unknowns: row.unknowns,
      depth: (row.depth as PredictionMarketEvaluationRecord["depth"]) ?? null,
      next_action: row.nextAction,
      snapshot_hash: row.snapshotHash,
      outcome_token_hash: row.outcomeTokenHash,
      agent_key: row.agentKey,
      agent_identity_kind:
        row.agentIdentityKind as PredictionMarketEvaluationRecord["agent_identity_kind"],
      client_name: row.clientName,
      attribution_source: row.attributionSource,
      is_external: row.isExternal,
      created_at: row.createdAt.toISOString(),
      expires_at: row.expiresAt.toISOString(),
      outcome: row.outcome as PredictionMarketEvaluationOutcome | null,
      outcome_reported_at: row.outcomeReportedAt?.toISOString() ?? null,
    }
  }

  async recordPredictionMarketEvaluationOutcome(input: {
    id: string
    outcome_token_hash: string
    outcome: PredictionMarketEvaluationOutcome
    reported_at: string
  }): Promise<"recorded" | "not_found" | "already_reported"> {
    const updated = await this.db
      .update(predictionMarketEvaluations)
      .set({
        outcome: input.outcome,
        outcomeReportedAt: new Date(input.reported_at),
      })
      .where(
        and(
          eq(predictionMarketEvaluations.id, input.id),
          eq(
            predictionMarketEvaluations.outcomeTokenHash,
            input.outcome_token_hash
          ),
          isNull(predictionMarketEvaluations.outcome)
        )
      )
      .returning({ id: predictionMarketEvaluations.id })
    if (updated[0]) return "recorded"
    const existing = await this.getPredictionMarketEvaluation(input.id)
    if (!existing || existing.outcome_token_hash !== input.outcome_token_hash) {
      return "not_found"
    }
    return "already_reported"
  }

  async predictionMarketEvaluationSummary(
    since = new Date("2026-01-01T00:00:00.000Z")
  ) {
    const ids = await this.db
      .select({ id: predictionMarketEvaluations.id })
      .from(predictionMarketEvaluations)
      .where(gte(predictionMarketEvaluations.createdAt, since))
    const records = (
      await Promise.all(
        ids.map((row) => this.getPredictionMarketEvaluation(row.id))
      )
    ).filter((record): record is PredictionMarketEvaluationRecord =>
      Boolean(record)
    )
    return buildPredictionMarketEvaluationSummary(records, since)
  }

  async getEndpointForTool(
    toolId: string
  ): Promise<{ id: string; url: string; transport: string } | null> {
    const row = await this.db
      .select({
        id: endpoints.id,
        url: endpoints.url,
        transport: endpoints.transport,
      })
      .from(endpoints)
      .where(eq(endpoints.toolId, toolId))
      .limit(1)
    const endpoint = row[0]
    return endpoint
      ? {
          id: endpoint.id,
          url: endpoint.url,
          transport: endpoint.transport,
        }
      : null
  }

  async insertVerificationCheck(
    check: Omit<VerificationCheckRecord, "id" | "checked_at"> & {
      checked_at?: string
    }
  ): Promise<VerificationCheckRecord> {
    const [row] = await this.db
      .insert(verificationChecks)
      .values({
        toolId: check.tool_id,
        endpointId: check.endpoint_id,
        checkType: check.check_type,
        status: check.status,
        latencyMs: check.latency_ms,
        evidence: check.evidence,
        checkedAt: check.checked_at ? new Date(check.checked_at) : undefined,
      })
      .returning()

    return {
      id: row!.id,
      tool_id: row!.toolId,
      endpoint_id: row!.endpointId,
      check_type: row!.checkType,
      status: row!.status,
      latency_ms: row!.latencyMs,
      evidence: (row!.evidence ?? {}) as Record<string, unknown>,
      checked_at: row!.checkedAt.toISOString(),
    }
  }

  async listVerificationChecks(
    toolId: string,
    limit = 20
  ): Promise<VerificationCheckRecord[]> {
    const rows = await this.db
      .select()
      .from(verificationChecks)
      .where(eq(verificationChecks.toolId, toolId))
      .orderBy(desc(verificationChecks.checkedAt))
      .limit(limit)

    return rows.map((row) => ({
      id: row.id,
      tool_id: row.toolId,
      endpoint_id: row.endpointId,
      check_type: row.checkType,
      status: row.status,
      latency_ms: row.latencyMs,
      evidence: (row.evidence ?? {}) as Record<string, unknown>,
      checked_at: row.checkedAt.toISOString(),
    }))
  }

  async upsertTrustProfile(
    toolId: string,
    profile: TrustProfile
  ): Promise<void> {
    const values = {
      toolId,
      ownershipScore: String(profile.ownership_score),
      availabilityScore: String(profile.availability_score),
      compatibilityScore: String(profile.compatibility_score),
      securityScore: String(profile.security_score),
      usageScore: String(profile.usage_score),
      overallScore: String(profile.overall_score),
      factors: profile.factors,
      algorithmVersion: profile.algorithm_version,
      computedAt: new Date(profile.computed_at),
    }

    await this.db
      .insert(trustScores)
      .values(values)
      .onConflictDoUpdate({
        target: trustScores.toolId,
        set: {
          ownershipScore: values.ownershipScore,
          availabilityScore: values.availabilityScore,
          compatibilityScore: values.compatibilityScore,
          securityScore: values.securityScore,
          usageScore: values.usageScore,
          overallScore: values.overallScore,
          factors: values.factors,
          algorithmVersion: values.algorithmVersion,
          computedAt: values.computedAt,
        },
      })
  }

  async recordActivationEvent(event: ActivationEventInput): Promise<void> {
    await this.db.insert(activationEvents).values({
      stage: event.stage,
      source: event.source,
      client: event.client ?? null,
      agentKey: event.agent_key ?? null,
      agentIdentityKind: event.agent_identity_kind ?? "anonymous",
      isExternal: event.is_external ?? false,
    })
  }

  async activationFunnelSummary(
    since = new Date("2026-01-01T00:00:00.000Z")
  ): Promise<ActivationFunnelSummary> {
    const stageRows = await this.db
      .select({
        stage: activationEvents.stage,
        events: sql<number>`count(*)::int`,
        identifiedAgents: sql<number>`count(distinct ${activationEvents.agentKey}) filter (where ${activationEvents.isExternal} = true and ${activationEvents.agentIdentityKind} = 'explicit')::int`,
        anonymousExternalEvents: sql<number>`count(*) filter (where ${activationEvents.isExternal} = true and ${activationEvents.agentIdentityKind} = 'anonymous')::int`,
      })
      .from(activationEvents)
      .where(gte(activationEvents.createdAt, since))
      .groupBy(activationEvents.stage)

    const [invocationStageRow] = await this.db
      .select({
        attemptEvents: sql<number>`count(*) filter (where ${invocations.isExternal} = true)::int`,
        attemptedAgents: sql<number>`count(distinct ${invocations.agentKey}) filter (where ${invocations.isExternal} = true and ${invocations.agentIdentityKind} = 'explicit')::int`,
        anonymousAttemptEvents: sql<number>`count(*) filter (where ${invocations.isExternal} = true and (${invocations.agentIdentityKind} is null or ${invocations.agentIdentityKind} = 'anonymous'))::int`,
        events: sql<number>`count(*) filter (where ${invocations.success} = true and ${invocations.isExternal} = true)::int`,
        identifiedAgents: sql<number>`count(distinct ${invocations.agentKey}) filter (where ${invocations.success} = true and ${invocations.isExternal} = true and ${invocations.agentIdentityKind} = 'explicit')::int`,
        anonymousExternalEvents: sql<number>`count(*) filter (where ${invocations.success} = true and ${invocations.isExternal} = true and (${invocations.agentIdentityKind} is null or ${invocations.agentIdentityKind} = 'anonymous'))::int`,
        failedEvents: sql<number>`count(*) filter (where ${invocations.success} = false and ${invocations.isExternal} = true)::int`,
        failedAgents: sql<number>`count(distinct ${invocations.agentKey}) filter (where ${invocations.success} = false and ${invocations.isExternal} = true and ${invocations.agentIdentityKind} = 'explicit')::int`,
        anonymousFailedEvents: sql<number>`count(*) filter (where ${invocations.success} = false and ${invocations.isExternal} = true and (${invocations.agentIdentityKind} is null or ${invocations.agentIdentityKind} = 'anonymous'))::int`,
      })
      .from(invocations)
      .where(gte(invocations.createdAt, since))

    const activationSourceRows = await this.db
      .select({
        source: activationEvents.source,
        connectViews: sql<number>`count(*) filter (where ${activationEvents.stage} = 'connect_view')::int`,
        installClicks: sql<number>`count(*) filter (where ${activationEvents.stage} = 'install_click')::int`,
        initializeEvents: sql<number>`count(*) filter (where ${activationEvents.stage} = 'mcp_initialize')::int`,
        initializedAgents: sql<number>`count(distinct ${activationEvents.agentKey}) filter (where ${activationEvents.stage} = 'mcp_initialize' and ${activationEvents.isExternal} = true and ${activationEvents.agentIdentityKind} = 'explicit')::int`,
        toolsListEvents: sql<number>`count(*) filter (where ${activationEvents.stage} = 'tools_list')::int`,
        toolsListedAgents: sql<number>`count(distinct ${activationEvents.agentKey}) filter (where ${activationEvents.stage} = 'tools_list' and ${activationEvents.isExternal} = true and ${activationEvents.agentIdentityKind} = 'explicit')::int`,
        promptsListEvents: sql<number>`count(*) filter (where ${activationEvents.stage} = 'prompts_list')::int`,
        promptsListedAgents: sql<number>`count(distinct ${activationEvents.agentKey}) filter (where ${activationEvents.stage} = 'prompts_list' and ${activationEvents.isExternal} = true and ${activationEvents.agentIdentityKind} = 'explicit')::int`,
        promptGetEvents: sql<number>`count(*) filter (where ${activationEvents.stage} = 'prompt_get')::int`,
        promptGetAgents: sql<number>`count(distinct ${activationEvents.agentKey}) filter (where ${activationEvents.stage} = 'prompt_get' and ${activationEvents.isExternal} = true and ${activationEvents.agentIdentityKind} = 'explicit')::int`,
      })
      .from(activationEvents)
      .where(gte(activationEvents.createdAt, since))
      .groupBy(activationEvents.source)

    const invocationSourceRows = await this.db
      .select({
        source: invocations.attributionSource,
        toolCallEvents: sql<number>`count(*)::int`,
        toolCallAgents: sql<number>`count(distinct ${invocations.agentKey}) filter (where ${invocations.agentIdentityKind} = 'explicit')::int`,
        failedInvocations: sql<number>`count(*) filter (where ${invocations.success} = false)::int`,
        failedAgents: sql<number>`count(distinct ${invocations.agentKey}) filter (where ${invocations.success} = false and ${invocations.agentIdentityKind} = 'explicit')::int`,
        successfulInvocations: sql<number>`count(*) filter (where ${invocations.success} = true)::int`,
        successfulAgents: sql<number>`count(distinct ${invocations.agentKey}) filter (where ${invocations.success} = true and ${invocations.agentIdentityKind} = 'explicit')::int`,
      })
      .from(invocations)
      .where(
        and(gte(invocations.createdAt, since), eq(invocations.isExternal, true))
      )
      .groupBy(invocations.attributionSource)

    const promptActivationRows = await this.db
      .select({
        source: activationEvents.source,
        promptActivatedAgents: sql<number>`count(distinct ${activationEvents.agentKey})::int`,
      })
      .from(activationEvents)
      .innerJoin(
        invocations,
        and(
          eq(invocations.attributionSource, activationEvents.source),
          eq(invocations.agentKey, activationEvents.agentKey),
          eq(invocations.success, true),
          eq(invocations.isExternal, true),
          eq(invocations.agentIdentityKind, "explicit"),
          gte(invocations.createdAt, since)
        )
      )
      .where(
        and(
          gte(activationEvents.createdAt, since),
          eq(activationEvents.stage, "prompt_get"),
          eq(activationEvents.isExternal, true),
          eq(activationEvents.agentIdentityKind, "explicit")
        )
      )
      .groupBy(activationEvents.source)

    const sourceMap = new Map<
      string,
      ActivationFunnelSummary["sources"][number]
    >()
    const sourceEntry = (source: string | null) => {
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
        prompts_list_events: 0,
        prompts_listed_agents: 0,
        prompt_get_events: 0,
        prompt_get_agents: 0,
        prompt_activated_agents: 0,
        tool_call_events: 0,
        tool_call_agents: 0,
        failed_invocations: 0,
        failed_agents: 0,
        successful_invocations: 0,
        successful_agents: 0,
        tool_call_rate: null,
        tool_success_rate: null,
        prompt_activation_rate: null,
        activation_rate: null,
      }
      sourceMap.set(key, created)
      return created
    }
    for (const row of activationSourceRows) {
      const entry = sourceEntry(row.source)
      entry.connect_views = Number(row.connectViews)
      entry.install_clicks = Number(row.installClicks)
      entry.initialize_events = Number(row.initializeEvents)
      entry.initialized_agents = Number(row.initializedAgents)
      entry.tools_list_events = Number(row.toolsListEvents)
      entry.tools_listed_agents = Number(row.toolsListedAgents)
      entry.prompts_list_events = Number(row.promptsListEvents)
      entry.prompts_listed_agents = Number(row.promptsListedAgents)
      entry.prompt_get_events = Number(row.promptGetEvents)
      entry.prompt_get_agents = Number(row.promptGetAgents)
    }
    for (const row of invocationSourceRows) {
      const entry = sourceEntry(row.source)
      entry.tool_call_events = Number(row.toolCallEvents)
      entry.tool_call_agents = Number(row.toolCallAgents)
      entry.failed_invocations = Number(row.failedInvocations)
      entry.failed_agents = Number(row.failedAgents)
      entry.successful_invocations = Number(row.successfulInvocations)
      entry.successful_agents = Number(row.successfulAgents)
    }
    for (const row of promptActivationRows) {
      sourceEntry(row.source).prompt_activated_agents = Number(
        row.promptActivatedAgents
      )
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
      source.prompt_activation_rate =
        source.prompt_get_agents > 0
          ? Number(
              (
                source.prompt_activated_agents / source.prompt_get_agents
              ).toFixed(4)
            )
          : null
      source.activation_rate =
        source.initialized_agents > 0
          ? Number(
              (source.successful_agents / source.initialized_agents).toFixed(4)
            )
          : null
    }

    const stageOrder = [
      "connect_view",
      "install_click",
      "mcp_initialize",
      "tools_list",
      "prompts_list",
      "prompt_get",
    ] as const
    const byStage = new Map(stageRows.map((row) => [row.stage, row]))

    return {
      window_start: since.toISOString(),
      generated_at: new Date().toISOString(),
      privacy:
        "Stores only funnel stage, source, client label, external classification, and an optional irreversible Agent ID HMAC. No raw IDs, IPs, prompts, arguments, or results.",
      stages: [
        ...stageOrder.map((stage) => {
          const row = byStage.get(stage)
          return {
            stage,
            events: Number(row?.events ?? 0),
            identified_agents: Number(row?.identifiedAgents ?? 0),
            anonymous_external_events: Number(
              row?.anonymousExternalEvents ?? 0
            ),
          }
        }),
        {
          stage: "tool_attempt" as const,
          events: Number(invocationStageRow?.attemptEvents ?? 0),
          identified_agents: Number(invocationStageRow?.attemptedAgents ?? 0),
          anonymous_external_events: Number(
            invocationStageRow?.anonymousAttemptEvents ?? 0
          ),
        },
        {
          stage: "successful_tool" as const,
          events: Number(invocationStageRow?.events ?? 0),
          identified_agents: Number(invocationStageRow?.identifiedAgents ?? 0),
          anonymous_external_events: Number(
            invocationStageRow?.anonymousExternalEvents ?? 0
          ),
        },
        {
          stage: "failed_tool" as const,
          events: Number(invocationStageRow?.failedEvents ?? 0),
          identified_agents: Number(invocationStageRow?.failedAgents ?? 0),
          anonymous_external_events: Number(
            invocationStageRow?.anonymousFailedEvents ?? 0
          ),
        },
      ],
      sources: [...sourceMap.values()].sort(
        (a, b) =>
          b.successful_agents - a.successful_agents ||
          b.successful_invocations - a.successful_invocations ||
          b.tool_call_agents - a.tool_call_agents ||
          b.tool_call_events - a.tool_call_events ||
          b.prompt_get_agents - a.prompt_get_agents ||
          b.prompt_get_events - a.prompt_get_events ||
          b.initialized_agents - a.initialized_agents ||
          b.initialize_events - a.initialize_events ||
          b.install_clicks - a.install_clicks ||
          b.connect_views - a.connect_views
      ),
    }
  }

  async recordInvocation(event: InvocationEvent): Promise<void> {
    await this.db.insert(invocations).values({
      toolId: event.tool_id ?? null,
      toolName: event.tool_name,
      version: event.version ?? null,
      source: event.source,
      success: event.success,
      latencyMs: event.latency_ms,
      errorType: event.error_type ?? null,
      agentKey: event.agent_key ?? null,
      agentIdentityKind: event.agent_identity_kind ?? "anonymous",
      clientName: event.client_name ?? null,
      attributionSource: event.attribution_source ?? "direct",
      isExternal: event.is_external ?? false,
      requestId: event.request_id ?? null,
      sessionKey: event.session_key ?? null,
      resultCount: event.result_count ?? null,
      startedAt: event.started_at ? new Date(event.started_at) : null,
      completedAt: event.completed_at ? new Date(event.completed_at) : null,
    })
  }

  async usageStats(
    toolId: string,
    sinceMs = 7 * 24 * 60 * 60 * 1000
  ): Promise<{ invocations: number; successes: number }> {
    const since = new Date(Date.now() - sinceMs)
    const rows = await this.db
      .select({
        invocations: sql<number>`count(*)::int`,
        successes: sql<number>`count(*) filter (where ${invocations.success})::int`,
      })
      .from(invocations)
      .where(
        and(eq(invocations.toolId, toolId), gte(invocations.createdAt, since))
      )

    return {
      invocations: Number(rows[0]?.invocations ?? 0),
      successes: Number(rows[0]?.successes ?? 0),
    }
  }

  async agentUsageSummary(
    since = new Date("2026-01-01T00:00:00.000Z")
  ): Promise<AgentUsageSummary> {
    const [totals] = await this.db
      .select({
        identifiedExternalAgents: sql<number>`count(distinct ${invocations.agentKey}) filter (where ${invocations.success} = true and ${invocations.isExternal} = true and ${invocations.agentIdentityKind} = 'explicit')::int`,
        successfulExternalInvocations: sql<number>`count(*) filter (where ${invocations.success} = true and ${invocations.isExternal} = true and ${invocations.agentIdentityKind} = 'explicit')::int`,
        anonymousSuccessfulInvocations: sql<number>`count(*) filter (where ${invocations.success} = true and ${invocations.isExternal} = true and (${invocations.agentIdentityKind} is null or ${invocations.agentIdentityKind} = 'anonymous'))::int`,
      })
      .from(invocations)
      .where(gte(invocations.createdAt, since))

    const sourceRows = await this.db
      .select({
        source: invocations.attributionSource,
        identifiedAgents: sql<number>`count(distinct ${invocations.agentKey})::int`,
        successfulInvocations: sql<number>`count(*)::int`,
      })
      .from(invocations)
      .where(
        and(
          gte(invocations.createdAt, since),
          eq(invocations.success, true),
          eq(invocations.isExternal, true),
          eq(invocations.agentIdentityKind, "explicit")
        )
      )
      .groupBy(invocations.attributionSource)
      .orderBy(sql`count(distinct ${invocations.agentKey}) desc`)

    const retentionRows = await this.db
      .select({
        agentKey: invocations.agentKey,
        clientName: invocations.clientName,
        attributionSource: invocations.attributionSource,
        createdAt: invocations.createdAt,
      })
      .from(invocations)
      .where(
        and(
          gte(invocations.createdAt, since),
          eq(invocations.success, true),
          eq(invocations.isExternal, true),
          eq(invocations.agentIdentityKind, "explicit")
        )
      )

    const byClient = new Map<
      string,
      { agents: Set<string>; invocations: number }
    >()
    for (const row of retentionRows) {
      if (!row.agentKey) continue
      const client = row.clientName ?? "unknown-client"
      const entry = byClient.get(client) ?? {
        agents: new Set<string>(),
        invocations: 0,
      }
      entry.agents.add(row.agentKey)
      entry.invocations += 1
      byClient.set(client, entry)
    }

    const target = 1_000
    const identified = Number(totals?.identifiedExternalAgents ?? 0)
    return {
      window_start: since.toISOString(),
      generated_at: new Date().toISOString(),
      target_external_agents: target,
      identified_external_agents: identified,
      successful_external_invocations: Number(
        totals?.successfulExternalInvocations ?? 0
      ),
      anonymous_successful_invocations: Number(
        totals?.anonymousSuccessfulInvocations ?? 0
      ),
      progress_ratio: Number(Math.min(1, identified / target).toFixed(4)),
      retention: buildAgentRetention(
        retentionRows.map((row) => ({
          tool_name: "qualified_external_execution",
          success: true,
          latency_ms: 0,
          agent_key: row.agentKey,
          agent_identity_kind: "explicit",
          client_name: row.clientName,
          attribution_source: row.attributionSource,
          is_external: true,
          created_at: row.createdAt,
        }))
      ),
      sources: sourceRows.map((row) => ({
        source: row.source ?? "direct",
        identified_agents: Number(row.identifiedAgents),
        successful_invocations: Number(row.successfulInvocations),
      })),
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

  async upsertVerifiedAgentAdmission(
    input: VerifiedAgentAdmissionInput
  ): Promise<{ created: boolean; admission: VerifiedAgentAdmissionRecord }> {
    const [existing] = await this.db
      .select({ id: verifiedAgentAdmissions.id })
      .from(verifiedAgentAdmissions)
      .where(eq(verifiedAgentAdmissions.agentKey, input.agent_key))
      .limit(1)
    const now = new Date()
    const [row] = await this.db
      .insert(verifiedAgentAdmissions)
      .values({
        agentKey: input.agent_key,
        operatorKey: input.operator_key,
        source: input.source,
        verificationMethod: input.verification_method,
        evidenceRefHash: input.evidence_ref_hash,
        status: "active",
        revokedAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: verifiedAgentAdmissions.agentKey,
        set: {
          operatorKey: input.operator_key,
          source: input.source,
          verificationMethod: input.verification_method,
          evidenceRefHash: input.evidence_ref_hash,
          status: "active",
          revokedAt: null,
          updatedAt: now,
        },
      })
      .returning()
    if (!row) throw new Error("Failed to persist verified Agent admission")
    return {
      created: !existing,
      admission: {
        id: row.id,
        agent_key: row.agentKey,
        operator_key: row.operatorKey,
        source: row.source,
        verification_method:
          row.verificationMethod as VerifiedAgentAdmissionRecord["verification_method"],
        evidence_ref_hash: row.evidenceRefHash,
        status: row.status as "active" | "revoked",
        verified_at: row.verifiedAt.toISOString(),
        revoked_at: row.revokedAt?.toISOString() ?? null,
      },
    }
  }

  async revokeVerifiedAgentAdmission(id: string): Promise<boolean> {
    const rows = await this.db
      .update(verifiedAgentAdmissions)
      .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(verifiedAgentAdmissions.id, id),
          eq(verifiedAgentAdmissions.status, "active")
        )
      )
      .returning({ id: verifiedAgentAdmissions.id })
    return rows.length > 0
  }

  async verifiedAgentEvidenceSummary(
    since = new Date("2026-01-01T00:00:00.000Z")
  ): Promise<VerifiedAgentEvidenceSummary> {
    const [admissionTotal] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(verifiedAgentAdmissions)
      .where(eq(verifiedAgentAdmissions.status, "active"))
    const rows = await this.db
      .select({
        agentKey: verifiedAgentAdmissions.agentKey,
        operatorKey: verifiedAgentAdmissions.operatorKey,
        source: verifiedAgentAdmissions.source,
        clientName: invocations.clientName,
        attributionSource: invocations.attributionSource,
        createdAt: invocations.createdAt,
      })
      .from(verifiedAgentAdmissions)
      .innerJoin(
        invocations,
        eq(verifiedAgentAdmissions.agentKey, invocations.agentKey)
      )
      .where(
        and(
          eq(verifiedAgentAdmissions.status, "active"),
          gte(invocations.createdAt, since),
          eq(invocations.success, true),
          eq(invocations.isExternal, true),
          eq(invocations.agentIdentityKind, "explicit")
        )
      )

    const agents = new Set(rows.map((row) => row.agentKey))
    const operators = new Set(rows.map((row) => row.operatorKey))
    const bySource = new Map<
      string,
      { agents: Set<string>; operators: Set<string>; invocations: number }
    >()
    for (const row of rows) {
      const entry = bySource.get(row.source) ?? {
        agents: new Set<string>(),
        operators: new Set<string>(),
        invocations: 0,
      }
      entry.agents.add(row.agentKey)
      entry.operators.add(row.operatorKey)
      entry.invocations += 1
      bySource.set(row.source, entry)
    }
    const target = 1_000
    return {
      window_start: since.toISOString(),
      generated_at: new Date().toISOString(),
      target_external_agents: target,
      active_admissions: Number(admissionTotal?.count ?? 0),
      verified_external_agents: agents.size,
      verified_operators: operators.size,
      successful_external_invocations: rows.length,
      progress_ratio: Number(Math.min(1, agents.size / target).toFixed(4)),
      retention: buildAgentRetention(
        rows.map((row) => ({
          tool_name: "verified_external_execution",
          success: true,
          latency_ms: 0,
          agent_key: row.agentKey,
          agent_identity_kind: "explicit",
          client_name: row.clientName,
          attribution_source: row.attributionSource,
          is_external: true,
          created_at: row.createdAt,
        }))
      ),
      sources: [...bySource.entries()]
        .map(([source, entry]) => ({
          source,
          verified_agents: entry.agents.size,
          verified_operators: entry.operators.size,
          successful_invocations: entry.invocations,
        }))
        .sort(
          (a, b) =>
            b.verified_agents - a.verified_agents ||
            b.successful_invocations - a.successful_invocations
        ),
    }
  }

  async reliabilitySummary(
    since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ): Promise<ReliabilitySummary> {
    const rows = await this.db
      .select({
        toolName: invocations.toolName,
        version: invocations.version,
        providerSlug: providers.slug,
        providerName: providers.name,
        success: invocations.success,
        latencyMs: invocations.latencyMs,
        errorType: invocations.errorType,
        agentKey: invocations.agentKey,
        agentIdentityKind: invocations.agentIdentityKind,
        clientName: invocations.clientName,
        attributionSource: invocations.attributionSource,
        isExternal: invocations.isExternal,
        resultCount: invocations.resultCount,
        createdAt: invocations.createdAt,
      })
      .from(invocations)
      .leftJoin(tools, eq(invocations.toolId, tools.id))
      .leftJoin(providers, eq(tools.providerId, providers.id))
      .where(
        and(gte(invocations.createdAt, since), eq(invocations.isExternal, true))
      )

    return buildReliabilitySummary(
      rows.map((row) => ({
        tool_name: row.toolName,
        version: row.version,
        provider_slug: row.providerSlug,
        provider_name: row.providerName,
        success: row.success,
        latency_ms: row.latencyMs,
        error_type: row.errorType,
        agent_key: row.agentKey,
        agent_identity_kind: row.agentIdentityKind as
          "explicit" | "anonymous" | "internal" | null,
        client_name: row.clientName,
        attribution_source: row.attributionSource,
        is_external: row.isExternal,
        result_count: row.resultCount,
        created_at: row.createdAt,
      })),
      since
    )
  }

  private async hydrateTool(
    toolId: string,
    db: Database = this.db
  ): Promise<CatalogTool | null> {
    const rows = await db
      .select({
        tool: tools,
        provider: providers,
        version: toolVersions,
        endpoint: endpoints,
        trust: trustScores,
      })
      .from(tools)
      .innerJoin(providers, eq(tools.providerId, providers.id))
      .leftJoin(
        toolVersions,
        and(eq(toolVersions.toolId, tools.id), eq(toolVersions.isLatest, true))
      )
      .leftJoin(endpoints, eq(endpoints.toolId, tools.id))
      .leftJoin(trustScores, eq(trustScores.toolId, tools.id))
      .where(eq(tools.id, toolId))
      .limit(1)

    const row = rows[0]
    if (!row) return null

    const stats = await this.usageStats(toolId)
    const trust = row.trust
      ? {
          ownership_score: num(row.trust.ownershipScore),
          availability_score: num(row.trust.availabilityScore),
          compatibility_score: num(row.trust.compatibilityScore),
          security_score: num(row.trust.securityScore),
          usage_score: num(row.trust.usageScore),
          overall_score: num(row.trust.overallScore),
          algorithm_version: row.trust.algorithmVersion,
          factors: (row.trust.factors ?? {}) as Record<string, unknown>,
          computed_at: row.trust.computedAt.toISOString(),
        }
      : null

    return {
      id: row.tool.id,
      slug: row.tool.slug,
      name: row.tool.name,
      description: row.tool.description,
      category: row.tool.category,
      capabilities: row.tool.capabilities ?? [],
      protocol: row.tool.protocol,
      status: row.tool.status,
      auth_requirement: row.tool.authRequirement,
      version: row.version?.version ?? null,
      endpoint: row.endpoint?.url ?? null,
      metadata: (row.tool.metadata ?? {}) as Record<string, unknown>,
      provider: {
        id: row.provider.id,
        slug: row.provider.slug,
        name: row.provider.name,
        verified: row.provider.verified,
      },
      trust,
      usage: {
        invocations_7d: stats.invocations,
        success_rate_7d:
          stats.invocations === 0
            ? null
            : Number((stats.successes / stats.invocations).toFixed(4)),
      },
      created_at: row.tool.createdAt.toISOString(),
      updated_at: row.tool.updatedAt.toISOString(),
    }
  }
}
