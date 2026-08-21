import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import { ZodError, z } from "zod"
import {
  compareCatalogTools,
  getCatalogTool,
  searchCatalogTools,
} from "../discovery.js"
import {
  buildCapabilityGraph,
  listCapabilities,
  recommendRelatedTools,
  toolsForCapability,
} from "../capability-graph.js"
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

export type V1RoutesOptions = {
  store: CatalogStore
}

/**
 * Versioned Agent Discovery + Registry API.
 * Does not replace first-party /tools or /understand — those remain executable.
 */
export const v1Routes: FastifyPluginAsync<V1RoutesOptions> = async (
  app,
  options
) => {
  const { store } = options

  app.post("/v1/tools", async (request, reply) => {
    try {
      const body = RegisterToolRequestSchema.parse(request.body)
      const tool = await store.registerTool(body)
      // Kick an immediate verification pass for the new tool.
      void verifyTool(store, tool.id).catch(() => undefined)
      return reply.status(201).send({ tool })
    } catch (error) {
      if (error instanceof Error && /already registered/i.test(error.message)) {
        return reply.status(409).send({
          error: "conflict",
          message: error.message,
        })
      }
      return reply.status(400).send(invalidRequest(error))
    }
  })

  app.get("/v1/tools/search", async (request, reply) => {
    try {
      const query = ToolSearchQuerySchema.parse(request.query)
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
      const tools = await compareCatalogTools(store, keys)
      return { count: tools.length, tools }
    } catch (error) {
      return reply.status(400).send(invalidRequest(error))
    }
  })

  app.get("/v1/capabilities", async () => {
    const capabilities = await listCapabilities(store)
    return { count: capabilities.length, capabilities }
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
    const tool = await getCatalogTool(store, idOrSlug)
    if (!tool) {
      return reply.status(404).send({
        error: "not_found",
        message: `Unknown tool: ${idOrSlug}`,
      })
    }
    return { tool }
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
    const tool = await getCatalogTool(store, idOrSlug)
    if (!tool) {
      return reply.status(404).send({
        error: "not_found",
        message: `Unknown tool: ${idOrSlug}`,
      })
    }
    const checks = await store.listVerificationChecks(tool.id, 50)
    return { tool_id: tool.id, checks }
  })

  app.post("/v1/tools/:idOrSlug/verify", async (request, reply) => {
    const { idOrSlug } = request.params as { idOrSlug: string }
    const tool = await getCatalogTool(store, idOrSlug)
    if (!tool) {
      return reply.status(404).send({
        error: "not_found",
        message: `Unknown tool: ${idOrSlug}`,
      })
    }
    const results = await verifyTool(store, tool.id)
    const trust = await refreshTrustForTool(store, tool.id)
    return { tool_id: tool.id, results, trust }
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
    // Do not leak active challenge tokens in public GET — only challenge metadata
    // without the token is exposed; full token is returned only by POST challenge.
    const metadata = { ...provider.metadata }
    const challenge = metadata.ownership_challenge as
      | { token?: string }
      | undefined
    if (challenge?.token) {
      metadata.ownership_challenge = {
        ...challenge,
        token: "[redacted]",
      }
    }
    return { provider: { ...provider, metadata } }
  })

  app.post("/v1/providers/:slug/ownership/challenge", async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string }
      const challenge = await createOwnershipChallenge(store, slug)
      return { challenge }
    } catch (error) {
      if (error instanceof Error && /Unknown provider/i.test(error.message)) {
        return reply.status(404).send({
          error: "not_found",
          message: error.message,
        })
      }
      return reply.status(400).send(invalidRequest(error))
    }
  })

  app.post("/v1/providers/:slug/ownership/verify", async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string }
      const result = await verifyOwnershipChallenge(store, slug)
      return reply.status(result.verified ? 200 : 400).send(result)
    } catch (error) {
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
  store: CatalogStore
): Promise<void> {
  await app.register(v1Routes, { store })
}
