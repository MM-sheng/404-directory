import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import { ZodError, z } from "zod"
import type { AppConfig } from "../../config.js"
import {
  AuthError,
  ForbiddenError,
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
import { refreshTrustForTool } from "../trust.js"
import { RegisterToolRequestSchema, ToolSearchQuerySchema } from "../types.js"
import { verifyTool } from "../verification.js"

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
}

/**
 * Versioned Agent Discovery + Registry API.
 * Write paths require Bearer admin token or provider API key.
 */
export const v1Routes: FastifyPluginAsync<V1RoutesOptions> = async (
  app,
  options
) => {
  const { store, config } = options

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
        count: tools.length,
        tools,
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
    return {
      metric: "identified_external_agents_with_successful_tool_execution",
      definition:
        "Unique privacy-safe X-404-Agent-ID digests from external clients with at least one successful tool execution since 2026-01-01. Probes, internal tests, anonymous calls, prompts, arguments, and raw identifiers are excluded.",
      ...metrics,
    }
  })

  app.get("/v1/capabilities/:capability/tools", async (request, reply) => {
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
  config: AppConfig
): Promise<void> {
  await app.register(v1Routes, { store, config })
}
