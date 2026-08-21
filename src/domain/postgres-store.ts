import { and, desc, eq, gte, sql } from "drizzle-orm"
import type { Database } from "../db/client.js"
import {
  endpoints,
  invocations,
  providers,
  tools,
  toolVersions,
  trustScores,
  verificationChecks,
} from "../db/schema.js"
import type {
  CatalogStore,
  EnsureToolOptions,
  ProviderRecord,
  ToolStatus,
} from "./store.js"
import type {
  CatalogTool,
  InvocationEvent,
  RegisterToolRequest,
  ToolSearchQuery,
  TrustProfile,
  VerificationCheckRecord,
} from "./types.js"

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
          metadata: input.metadata ?? {},
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
        method: "POST",
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
        const providerSlug =
          input.provider.slug ?? slugify(input.provider.name)
        await this.setProviderVerified(
          providerSlug,
          options.providerVerified,
          { ownership_method: "first_party" }
        )
      }
      // registerTool always creates pending; re-fetch after status/provider updates
      if (options.status || options.providerVerified !== undefined) {
        return (await this.getToolById(created.id)) ?? created
      }
      return created
    }

    await this.db
      .update(tools)
      .set({
        description: input.description,
        capabilities: input.capabilities,
        category: input.category,
        authRequirement: input.authentication,
        protocol: input.protocol,
        status: options.status ?? existing.status,
        metadata: input.metadata ?? {},
        updatedAt: new Date(),
      })
      .where(eq(tools.id, existing.id))

    const endpoint = await this.getEndpointForTool(existing.id)
    if (endpoint) {
      await this.db
        .update(endpoints)
        .set({ url: input.endpoint })
        .where(eq(endpoints.id, endpoint.id))
    }

    await this.db
      .update(toolVersions)
      .set({ isLatest: false })
      .where(eq(toolVersions.toolId, existing.id))

    await this.db.insert(toolVersions).values({
      toolId: existing.id,
      version: input.version,
      inputSchema: input.input_schema,
      outputSchema: input.output_schema,
      isLatest: true,
    })

    if (options.providerVerified !== undefined) {
      const providerSlug = input.provider.slug ?? slugify(input.provider.name)
      await this.setProviderVerified(providerSlug, options.providerVerified, {
        ownership_method: "first_party",
      })
    }

    return (await this.getToolById(existing.id))!
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
    const conditions = [sql`${tools.status} <> 'suspended'`]
    if (query.protocol) {
      conditions.push(sql`${tools.protocol} = ${query.protocol}`)
    }
    if (query.category) {
      conditions.push(sql`${tools.category} = ${query.category}`)
    }
    if (query.capability) {
      conditions.push(
        sql`${query.capability} = ANY(${tools.capabilities}) OR EXISTS (
          SELECT 1 FROM unnest(${tools.capabilities}) AS cap
          WHERE cap ILIKE ${"%" + query.capability + "%"}
        )`
      )
    }
    if (query.q) {
      const pattern = `%${query.q}%`
      conditions.push(
        sql`(${tools.name} ILIKE ${pattern} OR ${tools.description} ILIKE ${pattern})`
      )
    }

    const rows = await this.db
      .select({ id: tools.id })
      .from(tools)
      .where(and(...conditions))
      .limit(Math.min(query.limit * 3, 100))

    const hydrated: CatalogTool[] = []
    for (const row of rows) {
      const tool = await this.hydrateTool(row.id)
      if (!tool) continue
      if (
        query.trust_threshold !== undefined &&
        (tool.trust?.overall_score ?? 0) < query.trust_threshold
      ) {
        continue
      }
      hydrated.push(tool)
    }

    hydrated.sort((a, b) => {
      const trustDelta =
        (b.trust?.overall_score ?? 0) - (a.trust?.overall_score ?? 0)
      if (trustDelta !== 0) return trustDelta
      return b.usage.invocations_7d - a.usage.invocations_7d
    })

    return hydrated.slice(0, query.limit)
  }

  async listToolIdsForVerification(limit = 50): Promise<string[]> {
    const rows = await this.db
      .select({ id: tools.id })
      .from(tools)
      .where(sql`${tools.status} IN ('pending', 'active')`)
      .limit(limit)
    return rows.map((row) => row.id)
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

  async recordInvocation(event: InvocationEvent): Promise<void> {
    await this.db.insert(invocations).values({
      toolId: event.tool_id ?? null,
      toolName: event.tool_name,
      version: event.version ?? null,
      source: event.source,
      success: event.success,
      latencyMs: event.latency_ms,
      errorType: event.error_type ?? null,
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
