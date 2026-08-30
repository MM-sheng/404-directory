import { performance } from "node:perf_hooks"
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyRequest,
  FastifySchema,
} from "fastify"
import { ZodError, z } from "zod"
import type { AppConfig } from "../../config.js"
import {
  AuthError,
  ForbiddenError,
  assertAdminAccess,
  assertCanRegisterProviderSlug,
  assertCanRegisterToolSlug,
  assertProviderAccess,
  generateApiKey,
  hashApiKey,
  requireWriteAuth,
  resolveRegistryAuth,
} from "../auth.js"
import { isDiscoverableStatus } from "../lifecycle.js"
import {
  agentAttributionFromHeaders,
  withAgentAttribution,
} from "../agent-attribution.js"
import {
  buildCapabilityGraph,
  listCapabilities,
  recommendRelatedTools,
  toolsForCapability,
} from "../capability-graph.js"
import {
  compareCatalogTools,
  getCatalogTool,
  searchCatalogTools,
} from "../discovery.js"
import {
  createOwnershipChallenge,
  verifyOwnershipChallenge,
} from "../ownership.js"
import type { CatalogStore } from "../store.js"
import {
  EvaluateToolRiskRequestSchema,
  EvaluationOutcomeRequestSchema,
  UnknownRiskTargetError,
  evaluateToolRisk,
  getRiskEvaluationReceipt,
  reportRiskEvaluationOutcome,
} from "../risk-evaluation.js"
import {
  EvaluatePredictionMarketRequestSchema,
  PolymarketPublicDataSource,
  PredictionMarketInputError,
  PredictionMarketNotFoundError,
  PredictionMarketOutcomeRequestSchema,
  PredictionMarketUpstreamError,
  evaluatePredictionMarket,
  getPredictionMarketEvaluationReceipt,
  reportPredictionMarketOutcome,
  type PredictionMarketDataSource,
} from "../prediction-market-risk.js"
import { trackInvocation } from "../telemetry.js"
import { refreshTrustForTool } from "../trust.js"
import { RegisterToolRequestSchema, ToolSearchQuerySchema } from "../types.js"
import { toolSearchResponse } from "../catalog-search.js"
import { verifyTool } from "../verification.js"
import { zodToJsonSchema } from "../../tools/json-schema.js"
import {
  VerifiedAgentAdmissionRequestSchema,
  verifiedAgentAdmissionDigests,
} from "../verified-agent-evidence.js"

function invalidRequest(error: unknown): { error: string; message: string } {
  return {
    error: "invalid_request",
    message:
      error instanceof ZodError
        ? z.prettifyError(error)
        : error instanceof Error
          ? error.message
          : "Invalid request",
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export type V1RoutesOptions = {
  store: CatalogStore
  config: AppConfig
  predictionMarketDataSource: PredictionMarketDataSource
}

/**
 * Versioned Agent Discovery + Registry API.
 * Write paths require Bearer admin token or provider API key.
 */
export const v1Routes: FastifyPluginAsync<V1RoutesOptions> = async (
  app,
  options
) => {
  const { store, config, predictionMarketDataSource } = options

  const riskAttribution = (request: FastifyRequest) =>
    agentAttributionFromHeaders(
      request.headers,
      config.AGENT_ANALYTICS_SALT!,
      undefined,
      { request_id: request.id }
    )

  app.addHook("onRoute", (routeOptions) => {
    if (routeOptions.url?.startsWith("/v1")) {
      routeOptions.schema = {
        ...(routeOptions.schema as object),
        tags: ["v1-discovery"],
      }
    }
  })

  app.post(
    "/v1/tools",
    {
      schema: {
        summary: "Register a tool (auth required)",
        description:
          "Bearer REGISTRY_ADMIN_TOKEN or provider API key. New providers receive a one-time provider_api_key. Tools stay pending (quarantine) until ownership + verification.",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      try {
        const auth = await resolveRegistryAuth(request, store, config)
        requireWriteAuth(auth, config)

        const body = RegisterToolRequestSchema.parse(request.body)
        const toolSlug = slugify(body.name)
        assertCanRegisterToolSlug(toolSlug)

        const providerSlug = body.provider.slug ?? slugify(body.provider.name)
        const existingProvider = await store.getProviderBySlug(providerSlug)

        let issuedApiKey: string | undefined
        if (existingProvider) {
          assertProviderAccess(auth, providerSlug)
        } else {
          assertCanRegisterProviderSlug(providerSlug)
          if (auth.kind === "provider") {
            throw new ForbiddenError(
              "Provider keys cannot create additional providers"
            )
          }
          issuedApiKey = generateApiKey()
        }

        const tool = await store.registerTool(body)

        if (issuedApiKey) {
          await store.setProviderMetadata(providerSlug, {
            ...((await store.getProviderBySlug(providerSlug))?.metadata ?? {}),
            api_key_hash: hashApiKey(issuedApiKey),
          })
        }

        // Do not auto-verify; stay in quarantine until ownership + checks pass.
        return reply.status(201).send({
          tool,
          ...(issuedApiKey
            ? {
                provider_api_key: issuedApiKey,
                warning:
                  "Store provider_api_key now; it is shown only once and required for ownership + tool writes.",
              }
            : {}),
        })
      } catch (error) {
        if (error instanceof AuthError || error instanceof ForbiddenError) {
          return reply.status(error.statusCode).send({
            error: error.name === "AuthError" ? "unauthorized" : "forbidden",
            message: error.message,
          })
        }
        if (
          error instanceof Error &&
          /already registered/i.test(error.message)
        ) {
          return reply.status(409).send({
            error: "conflict",
            message: error.message,
          })
        }
        return reply.status(400).send(invalidRequest(error))
      }
    }
  )

  app.post(
    "/v1/evaluations",
    {
      schema: {
        summary: "Preflight a third-party Agent tool",
        description:
          "Return a contextual allow, review, or block decision before installing or invoking a registered tool. Stores only bounded context and evidence; never prompts or payloads.",
        body: zodToJsonSchema(EvaluateToolRiskRequestSchema),
      } as FastifySchema,
    },
    async (request, reply) => {
      const started = performance.now()
      const attribution = riskAttribution(request)
      try {
        const input = EvaluateToolRiskRequestSchema.parse(request.body)
        const evaluation = await withAgentAttribution(attribution, () =>
          evaluateToolRisk(store, input, config.PUBLIC_BASE_URL)
        )
        await withAgentAttribution(attribution, () =>
          trackInvocation(store, {
            tool_id: evaluation.target.id,
            tool_name: "evaluate_tool_risk",
            source: "http:risk-preflight",
            success: true,
            latency_ms: performance.now() - started,
            result_count: 1,
          })
        )
        return reply
          .header("cache-control", "no-store")
          .status(201)
          .send(evaluation)
      } catch (error) {
        await withAgentAttribution(attribution, () =>
          trackInvocation(store, {
            tool_name: "evaluate_tool_risk",
            source: "http:risk-preflight",
            success: false,
            latency_ms: performance.now() - started,
            error_type:
              error instanceof UnknownRiskTargetError
                ? "unknown_target"
                : "invalid_request",
            result_count: 0,
          })
        ).catch(() => undefined)
        if (error instanceof UnknownRiskTargetError) {
          return reply.status(404).send({
            error: "not_found",
            message: error.message,
          })
        }
        return reply.status(400).send(invalidRequest(error))
      }
    }
  )

  app.post(
    "/v1/prediction-markets/evaluations",
    {
      schema: {
        summary: "Preflight one Polymarket decision",
        description:
          "Evaluate public settlement rules, timing, order-book liquidity, caller-observed geographic eligibility, and execution mode. Never predicts a winner or places an order.",
        body: zodToJsonSchema(EvaluatePredictionMarketRequestSchema),
      } as FastifySchema,
    },
    async (request, reply) => {
      const started = performance.now()
      const attribution = riskAttribution(request)
      try {
        const input = EvaluatePredictionMarketRequestSchema.parse(request.body)
        const evaluation = await withAgentAttribution(attribution, () =>
          evaluatePredictionMarket(
            store,
            input,
            predictionMarketDataSource,
            config.PUBLIC_BASE_URL
          )
        )
        await withAgentAttribution(attribution, () =>
          trackInvocation(store, {
            tool_name: "evaluate_prediction_market",
            source: "http:prediction-market-preflight",
            success: true,
            latency_ms: performance.now() - started,
            result_count: 1,
          })
        )
        return reply
          .header("cache-control", "no-store")
          .status(201)
          .send(evaluation)
      } catch (error) {
        await withAgentAttribution(attribution, () =>
          trackInvocation(store, {
            tool_name: "evaluate_prediction_market",
            source: "http:prediction-market-preflight",
            success: false,
            latency_ms: performance.now() - started,
            error_type:
              error instanceof PredictionMarketNotFoundError
                ? "market_not_found"
                : error instanceof PredictionMarketUpstreamError
                  ? "provider_error"
                  : "invalid_request",
            result_count: 0,
          })
        ).catch(() => undefined)
        if (error instanceof PredictionMarketNotFoundError) {
          return reply.status(404).send({
            error: "not_found",
            message: error.message,
          })
        }
        if (error instanceof PredictionMarketUpstreamError) {
          return reply.status(502).send({
            error: "upstream_unavailable",
            message: error.message,
          })
        }
        if (error instanceof PredictionMarketInputError) {
          return reply.status(400).send({
            error: "invalid_request",
            message: error.message,
          })
        }
        return reply.status(400).send(invalidRequest(error))
      }
    }
  )

  app.get(
    "/v1/prediction-markets/evaluations/:id",
    {
      schema: {
        summary: "Read a prediction-market preflight receipt",
        description:
          "Returns the public decision, bounded intent, evidence, unknowns, and optional bounded behavior outcome. Never returns the one-time outcome token or its hash.",
      } as FastifySchema,
    },
    async (request, reply) => {
      try {
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
        const receipt = await getPredictionMarketEvaluationReceipt(store, id)
        if (!receipt) {
          return reply.status(404).send({
            error: "not_found",
            message: `Unknown prediction-market evaluation receipt: ${id}`,
          })
        }
        return reply.header("cache-control", "no-store").send(receipt)
      } catch (error) {
        return reply.status(400).send(invalidRequest(error))
      }
    }
  )

  app.post(
    "/v1/prediction-markets/evaluations/:id/outcome",
    {
      schema: {
        summary: "Report bounded behavior after prediction-market preflight",
        description:
          "Accepts only bounded behavior/execution enums and the one-time token. Never send wallet data, order payloads, prompts, personal data, or free-form rationale.",
        body: zodToJsonSchema(PredictionMarketOutcomeRequestSchema),
      } as FastifySchema,
    },
    async (request, reply) => {
      try {
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
        const outcome = PredictionMarketOutcomeRequestSchema.parse(request.body)
        const status = await reportPredictionMarketOutcome(store, id, outcome)
        if (status === "not_found") {
          return reply.status(404).send({
            error: "not_found",
            message: "Receipt or one-time outcome token was not found.",
          })
        }
        return reply.header("cache-control", "no-store").send({
          receipt_id: id,
          status,
          evidence_level: "self_reported",
          calibration_effect:
            "This report measures behavior and execution only. It does not establish profitability or prediction accuracy.",
        })
      } catch (error) {
        return reply.status(400).send(invalidRequest(error))
      }
    }
  )

  app.get(
    "/v1/metrics/prediction-market-evaluations",
    {
      schema: {
        summary: "Get privacy-safe prediction-market preflight metrics",
        description:
          "Versioned prediction-market metrics by internal, anonymous external, identified external, and unattributed evaluation cohorts. Legacy top-level aggregates are total traffic; read scopes for external-use evidence. Qualified pilot operators are not inferred from identities.",
      } as FastifySchema,
    },
    async (_request, reply) => {
      const summary = await store.predictionMarketEvaluationSummary()
      return reply.header("cache-control", "no-store").send(summary)
    }
  )

  app.get(
    "/v1/evaluations/:id",
    {
      schema: {
        summary: "Read a public risk decision receipt",
        description:
          "Returns the versioned decision, bounded context, evidence, unknowns, and optional bounded outcome. Never returns the outcome token or its hash.",
      } as FastifySchema,
    },
    async (request, reply) => {
      try {
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
        const receipt = await getRiskEvaluationReceipt(store, id)
        if (!receipt) {
          return reply.status(404).send({
            error: "not_found",
            message: `Unknown evaluation receipt: ${id}`,
          })
        }
        return reply.header("cache-control", "no-store").send(receipt)
      } catch (error) {
        return reply.status(400).send(invalidRequest(error))
      }
    }
  )

  app.get(
    "/v1/metrics/risk-evaluations",
    {
      schema: {
        summary: "Get privacy-safe risk preflight metrics",
        description:
          "Versioned tool-risk metrics by internal, anonymous external, identified external, and unattributed evaluation cohorts. Legacy top-level aggregates are total traffic; read scopes for external-use evidence. Qualified pilot operators are not inferred from identities.",
      } as FastifySchema,
    },
    async (_request, reply) => {
      const summary = await store.riskEvaluationSummary()
      return reply.header("cache-control", "no-store").send(summary)
    }
  )

  app.post(
    "/v1/evaluations/:id/outcome",
    {
      schema: {
        summary: "Attach one bounded outcome to a risk decision",
        description:
          "Requires the one-time token returned by the evaluation. Self-reported outcomes do not directly increase Trust.",
        body: zodToJsonSchema(EvaluationOutcomeRequestSchema),
      } as FastifySchema,
    },
    async (request, reply) => {
      try {
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
        const outcome = EvaluationOutcomeRequestSchema.parse(request.body)
        const status = await reportRiskEvaluationOutcome(store, id, outcome)
        if (status === "not_found") {
          return reply.status(404).send({
            error: "not_found",
            message: "Receipt or outcome token was not found.",
          })
        }
        return reply.header("cache-control", "no-store").send({
          receipt_id: id,
          status,
          evidence_level: "self_reported",
          trust_effect:
            "This report is behavioral evidence and does not directly increase the target Trust score.",
        })
      } catch (error) {
        return reply.status(400).send(invalidRequest(error))
      }
    }
  )

  app.get("/v1/tools/search", async (request, reply) => {
    try {
      const query = ToolSearchQuerySchema.parse(request.query)
      // Non-active statuses are quarantine — admin only.
      if (query.status !== "active") {
        const auth = await resolveRegistryAuth(request, store, config)
        if (auth.kind !== "admin") {
          return reply.status(403).send({
            error: "forbidden",
            message: "Only admin can query non-active (quarantine) tools",
          })
        }
      }
      const tools = await searchCatalogTools(store, query)
      return {
        query,
        ...toolSearchResponse(tools, query),
      }
    } catch (error) {
      return reply.status(400).send(invalidRequest(error))
    }
  })

  app.get("/v1/tools/compare", async (request, reply) => {
    try {
      const query = z
        .object({
          ids: z.string().min(1),
        })
        .parse(request.query)
      const keys = query.ids
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
      const tools = (await compareCatalogTools(store, keys)).filter((tool) =>
        isDiscoverableStatus(tool.status)
      )
      return { count: tools.length, tools }
    } catch (error) {
      return reply.status(400).send(invalidRequest(error))
    }
  })

  app.get("/v1/capabilities", async () => {
    const capabilities = await listCapabilities(store)
    return { count: capabilities.length, capabilities }
  })

  app.get("/v1/metrics/agents", async () => {
    const metrics = await store.agentUsageSummary()
    const diagnostic: Partial<typeof metrics> = { ...metrics }
    delete diagnostic.target_external_agents
    delete diagnostic.progress_ratio
    return {
      metric:
        "unverified_agent_installation_ids_with_successful_tool_execution",
      definition:
        "Unique privacy-safe installation ID digests from external-classified clients with at least one successful tool execution since 2026-01-01. This diagnostic does not prove independent operators or real AI Agents and does not count toward the 1,000-Agent target. Internal and anonymous calls are excluded; prompts, arguments, results, and raw identifiers are never stored.",
      counts_toward_target: false,
      verified_target_metric: "/v1/metrics/verified-agents",
      ...diagnostic,
    }
  })

  app.get("/v1/metrics/verified-agents", async () => {
    const metrics = await store.verifiedAgentEvidenceSummary()
    return {
      metric: "verified_independent_external_agents_with_successful_execution",
      definition:
        "Unique active, manually admitted Agent installation digests that match at least one successful external explicit tool invocation since 2026-01-01. Admission requires separate evidence for an independent operator; admissions alone, anonymous calls, failures, internal tests, probes, crawlers, and duplicate installation IDs do not count. Operator and evidence references are stored only as domain-separated irreversible HMAC digests.",
      evidence_status: "manual_admission_v1",
      ...metrics,
    }
  })

  app.post(
    "/v1/pilot/verified-agents",
    {
      schema: {
        summary: "Admit independently verified Agent evidence (admin only)",
        description:
          "Accepts random non-personal Agent/operator IDs plus a public evidence reference. Persists only irreversible HMAC digests. Admission does not count until the Agent has a successful external tool invocation.",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      try {
        const auth = await resolveRegistryAuth(request, store, config)
        assertAdminAccess(auth)
        const body = VerifiedAgentAdmissionRequestSchema.parse(request.body)
        const digests = verifiedAgentAdmissionDigests(
          body,
          config.AGENT_ANALYTICS_SALT!
        )
        const result = await store.upsertVerifiedAgentAdmission({
          ...digests,
          source: body.source,
          verification_method: body.verification_method,
        })
        return reply.status(result.created ? 201 : 200).send({
          created: result.created,
          admission: result.admission,
          counts_toward_target: false,
          next_requirement:
            "A matching successful external explicit tool invocation is required.",
        })
      } catch (error) {
        if (error instanceof AuthError || error instanceof ForbiddenError) {
          return reply.status(error.statusCode).send({
            error: error.name === "AuthError" ? "unauthorized" : "forbidden",
            message: error.message,
          })
        }
        return reply.status(400).send(invalidRequest(error))
      }
    }
  )

  app.delete(
    "/v1/pilot/verified-agents/:id",
    {
      schema: {
        summary: "Revoke verified Agent evidence (admin only)",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      try {
        const auth = await resolveRegistryAuth(request, store, config)
        assertAdminAccess(auth)
        const { id } = z.object({ id: z.uuid() }).strict().parse(request.params)
        const revoked = await store.revokeVerifiedAgentAdmission(id)
        if (!revoked) {
          return reply.status(404).send({
            error: "not_found",
            message: "Active verified Agent admission not found",
          })
        }
        return { revoked: true, id }
      } catch (error) {
        if (error instanceof AuthError || error instanceof ForbiddenError) {
          return reply.status(error.statusCode).send({
            error: error.name === "AuthError" ? "unauthorized" : "forbidden",
            message: error.message,
          })
        }
        return reply.status(400).send(invalidRequest(error))
      }
    }
  )

  app.get("/v1/metrics/activation", async () => {
    const funnel = await store.activationFunnelSummary()
    return {
      metric: "privacy_safe_agent_activation_funnel",
      definition:
        "Observed connection and installation activity plus de-duplicated external Agents at MCP initialization, tools/list, prompts/list, prompts/get, tool-call attempt, failure, and successful execution. Connect views, install clicks, initialization, listing, prompt activity, attempts, and failures are diagnostic only; only a successful tool execution counts toward the 1,000-Agent target.",
      ...funnel,
    }
  })

  app.get("/v1/metrics/reliability", async (request, reply) => {
    try {
      const { days } = z
        .object({
          days: z.coerce.number().int().min(1).max(90).default(30),
        })
        .strict()
        .parse(request.query)
      const reliability = await store.reliabilitySummary(
        new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      )
      return {
        metric: "privacy_safe_tool_provider_reliability",
        definition:
          "Aggregated real external execution evidence by tool, registered provider, safe client label, and attribution source. Internal executions are excluded; anonymous external executions can inform reliability but never count as identified Agents.",
        window_days: days,
        ...reliability,
      }
    } catch (error) {
      return reply.status(400).send(invalidRequest(error))
    }
  })

  app.get("/v1/capabilities/:capability/tools", async (request) => {
    const { capability } = request.params as { capability: string }
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(50).default(20) })
      .parse(request.query)
    const tools = await toolsForCapability(store, capability, query.limit)
    return { capability, count: tools.length, tools }
  })

  app.get("/v1/graph/capabilities", async (request, reply) => {
    try {
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          min_similarity: z.coerce.number().min(0).max(1).default(0.05),
        })
        .parse(request.query)
      const graph = await buildCapabilityGraph(store, {
        limit: query.limit,
        minSimilarity: query.min_similarity,
      })
      return graph
    } catch (error) {
      return reply.status(400).send(invalidRequest(error))
    }
  })

  app.get("/v1/tools/:idOrSlug", async (request, reply) => {
    const { idOrSlug } = request.params as { idOrSlug: string }
    const publicTool = await getCatalogTool(store, idOrSlug)
    if (publicTool) return { tool: publicTool }

    const quarantine = await getCatalogTool(store, idOrSlug, {
      includeQuarantine: true,
    })
    if (!quarantine) {
      return reply.status(404).send({
        error: "not_found",
        message: `Unknown tool: ${idOrSlug}`,
      })
    }
    const auth = await resolveRegistryAuth(request, store, config)
    try {
      assertProviderAccess(auth, quarantine.provider.slug)
    } catch (error) {
      if (error instanceof AuthError || error instanceof ForbiddenError) {
        return reply.status(404).send({
          error: "not_found",
          message: `Unknown tool: ${idOrSlug}`,
        })
      }
      throw error
    }
    return { tool: quarantine, quarantine: true }
  })

  app.get("/v1/tools/:idOrSlug/trust", async (request, reply) => {
    const { idOrSlug } = request.params as { idOrSlug: string }
    const tool = await getCatalogTool(store, idOrSlug)
    if (!tool) {
      return reply.status(404).send({
        error: "not_found",
        message: `Unknown tool: ${idOrSlug}`,
      })
    }
    const trust = tool.trust ?? (await refreshTrustForTool(store, tool.id))
    return {
      tool_id: tool.id,
      slug: tool.slug,
      trust,
    }
  })

  app.get("/v1/tools/:idOrSlug/related", async (request, reply) => {
    const { idOrSlug } = request.params as { idOrSlug: string }
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(20).default(5) })
      .parse(request.query)
    const seed = await getCatalogTool(store, idOrSlug)
    if (!seed) {
      return reply.status(404).send({
        error: "not_found",
        message: `Unknown tool: ${idOrSlug}`,
      })
    }
    const related = await recommendRelatedTools(store, idOrSlug, query.limit)
    return {
      seed: { id: seed.id, slug: seed.slug, name: seed.name },
      count: related.length,
      related,
    }
  })

  app.get("/v1/tools/:idOrSlug/verifications", async (request, reply) => {
    const { idOrSlug } = request.params as { idOrSlug: string }
    const tool = await getCatalogTool(store, idOrSlug, {
      includeQuarantine: true,
    })
    if (!tool) {
      return reply.status(404).send({
        error: "not_found",
        message: `Unknown tool: ${idOrSlug}`,
      })
    }
    if (tool.status !== "active") {
      const auth = await resolveRegistryAuth(request, store, config)
      try {
        assertProviderAccess(auth, tool.provider.slug)
      } catch (error) {
        if (error instanceof AuthError || error instanceof ForbiddenError) {
          return reply.status(error.statusCode).send({
            error: error.name === "AuthError" ? "unauthorized" : "forbidden",
            message: error.message,
          })
        }
        throw error
      }
    }
    const checks = await store.listVerificationChecks(tool.id, 50)
    return { tool_id: tool.id, checks }
  })

  app.post("/v1/tools/:idOrSlug/verify", async (request, reply) => {
    try {
      const auth = await resolveRegistryAuth(request, store, config)
      requireWriteAuth(auth, config)
      const { idOrSlug } = request.params as { idOrSlug: string }
      const tool = await getCatalogTool(store, idOrSlug, {
        includeQuarantine: true,
      })
      if (!tool) {
        return reply.status(404).send({
          error: "not_found",
          message: `Unknown tool: ${idOrSlug}`,
        })
      }
      assertProviderAccess(auth, tool.provider.slug)
      const results = await verifyTool(store, tool.id)
      const trust = await refreshTrustForTool(store, tool.id)
      const refreshed = await store.getToolById(tool.id)
      return {
        tool_id: tool.id,
        status: refreshed?.status,
        results,
        trust,
      }
    } catch (error) {
      if (error instanceof AuthError || error instanceof ForbiddenError) {
        return reply.status(error.statusCode).send({
          error: error.name === "AuthError" ? "unauthorized" : "forbidden",
          message: error.message,
        })
      }
      return reply.status(400).send(invalidRequest(error))
    }
  })

  app.post("/v1/receipts", async (_request, reply) => {
    // Anonymous receipts are a trust-poisoning vector. Disabled until Agent API
    // keys + signed receipts + allowlisted discovery_query fields ship.
    return reply.status(403).send({
      error: "receipts_disabled",
      message:
        "Usage receipts are disabled until authenticated Agent credentials and signed receipts are available. Do not submit unverifiable outcome data.",
    })
  })

  app.get("/v1/providers/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const provider = await store.getProviderBySlug(slug)
    if (!provider) {
      return reply.status(404).send({
        error: "not_found",
        message: `Unknown provider: ${slug}`,
      })
    }
    const metadata = { ...provider.metadata }
    delete metadata.api_key_hash
    const challenge = metadata.ownership_challenge as
      { token?: string } | undefined
    if (challenge?.token) {
      metadata.ownership_challenge = {
        ...challenge,
        token: "[redacted]",
      }
    }
    return { provider: { ...provider, metadata } }
  })

  app.post(
    "/v1/providers/:slug/ownership/challenge",
    async (request, reply) => {
      try {
        const auth = await resolveRegistryAuth(request, store, config)
        requireWriteAuth(auth, config)
        const { slug } = request.params as { slug: string }
        assertProviderAccess(auth, slug)
        const challenge = await createOwnershipChallenge(store, slug, {
          cooldownMs: config.OWNERSHIP_CHALLENGE_COOLDOWN_MS,
          force: auth.kind === "admin",
        })
        return { challenge }
      } catch (error) {
        if (error instanceof AuthError || error instanceof ForbiddenError) {
          return reply.status(error.statusCode).send({
            error: error.name === "AuthError" ? "unauthorized" : "forbidden",
            message: error.message,
          })
        }
        if (error instanceof Error && /Unknown provider/i.test(error.message)) {
          return reply.status(404).send({
            error: "not_found",
            message: error.message,
          })
        }
        return reply.status(400).send(invalidRequest(error))
      }
    }
  )

  app.post("/v1/providers/:slug/ownership/verify", async (request, reply) => {
    try {
      const auth = await resolveRegistryAuth(request, store, config)
      requireWriteAuth(auth, config)
      const { slug } = request.params as { slug: string }
      assertProviderAccess(auth, slug)
      const result = await verifyOwnershipChallenge(store, slug)
      return reply.status(result.verified ? 200 : 400).send(result)
    } catch (error) {
      if (error instanceof AuthError || error instanceof ForbiddenError) {
        return reply.status(error.statusCode).send({
          error: error.name === "AuthError" ? "unauthorized" : "forbidden",
          message: error.message,
        })
      }
      if (error instanceof Error && /Unknown provider/i.test(error.message)) {
        return reply.status(404).send({
          error: "not_found",
          message: error.message,
        })
      }
      return reply.status(400).send(invalidRequest(error))
    }
  })
}

export async function registerV1Routes(
  app: FastifyInstance,
  store: CatalogStore,
  config: AppConfig,
  predictionMarketDataSource: PredictionMarketDataSource = new PolymarketPublicDataSource()
): Promise<void> {
  await app.register(v1Routes, {
    store,
    config,
    predictionMarketDataSource,
  })
}
