import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  buildCapabilityGraph,
  listCapabilities,
  recommendRelatedTools,
} from "../domain/capability-graph.js"
import {
  compareCatalogTools,
  getCatalogTool,
  searchCatalogTools,
} from "../domain/discovery.js"
import type { CatalogStore } from "../domain/store.js"
import { refreshTrustForTool } from "../domain/trust.js"
import { ToolProtocolSchema } from "../domain/types.js"

/**
 * MCP Discovery tools — let agents discover/trust the 404 ecosystem
 * without replacing first-party executable tools (verify_web, understand_webpage).
 */
export function registerDiscoveryMcpTools(
  server: McpServer,
  store: CatalogStore
): void {
  server.registerTool(
    "search_tools",
    {
      title: "Search 404 tool catalog",
      description:
        "Search the 404.directory ecosystem catalog by capability, protocol, category, or trust threshold. Use before choosing a third-party tool. Does not execute tools.",
      inputSchema: z
        .object({
          q: z.string().max(256).optional(),
          capability: z.string().max(64).optional(),
          protocol: ToolProtocolSchema.optional(),
          category: z.string().max(64).optional(),
          trust_threshold: z.number().min(0).max(1).optional(),
          limit: z.number().int().min(1).max(50).default(10),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const tools = await searchCatalogTools(store, args)
      const payload = { count: tools.length, tools }
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
      }
    }
  )

  server.registerTool(
    "get_tool",
    {
      title: "Get catalog tool",
      description:
        "Fetch one registered ecosystem tool by id or slug, including trust profile and usage stats.",
      inputSchema: z
        .object({
          id_or_slug: z.string().min(1).max(128),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const tool = await getCatalogTool(store, args.id_or_slug)
      if (!tool) {
        return {
          isError: true,
          content: [{ type: "text", text: `Unknown tool: ${args.id_or_slug}` }],
        }
      }
      const payload = { tool }
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
      }
    }
  )

  server.registerTool(
    "compare_tools",
    {
      title: "Compare catalog tools",
      description:
        "Compare up to 5 ecosystem tools side-by-side (capabilities, trust dimensions, usage).",
      inputSchema: z
        .object({
          ids_or_slugs: z.array(z.string().min(1).max(128)).min(2).max(5),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const tools = await compareCatalogTools(store, args.ids_or_slugs)
      const payload = { count: tools.length, tools }
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
      }
    }
  )

  server.registerTool(
    "get_trust_score",
    {
      title: "Get trust profile",
      description:
        "Return the machine-readable Trust Profile for a catalog tool (ownership, availability, compatibility, security, usage).",
      inputSchema: z
        .object({
          id_or_slug: z.string().min(1).max(128),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const tool = await getCatalogTool(store, args.id_or_slug)
      if (!tool) {
        return {
          isError: true,
          content: [{ type: "text", text: `Unknown tool: ${args.id_or_slug}` }],
        }
      }
      const trust = tool.trust ?? (await refreshTrustForTool(store, tool.id))
      const payload = {
        tool_id: tool.id,
        slug: tool.slug,
        trust,
      }
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
      }
    }
  )

  server.registerTool(
    "recommend_tools",
    {
      title: "Recommend related tools",
      description:
        "Given one known tool, recommend similar catalog tools via the Capability Graph (shared capabilities + protocol/category affinity).",
      inputSchema: z
        .object({
          id_or_slug: z.string().min(1).max(128),
          limit: z.number().int().min(1).max(20).default(5),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const related = await recommendRelatedTools(
        store,
        args.id_or_slug,
        args.limit
      )
      if (related.length === 0) {
        const seed = await getCatalogTool(store, args.id_or_slug)
        if (!seed) {
          return {
            isError: true,
            content: [
              { type: "text", text: `Unknown tool: ${args.id_or_slug}` },
            ],
          }
        }
      }
      const payload = { count: related.length, related }
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
      }
    }
  )

  server.registerTool(
    "list_capabilities",
    {
      title: "List capability index",
      description:
        "List capabilities in the 404 catalog with tool counts. Use to explore the Capability Graph before searching.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const capabilities = await listCapabilities(store)
      const payload = { count: capabilities.length, capabilities }
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
      }
    }
  )

  server.registerTool(
    "get_capability_graph",
    {
      title: "Get capability graph",
      description:
        "Return a Capability Graph snapshot (nodes, shared-capability edges, capability index) for agent planning.",
      inputSchema: z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
          min_similarity: z.number().min(0).max(1).default(0.05),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const graph = await buildCapabilityGraph(store, {
        limit: args.limit,
        minSimilarity: args.min_similarity,
      })
      return {
        content: [{ type: "text", text: JSON.stringify(graph) }],
        structuredContent: graph as unknown as Record<string, unknown>,
      }
    }
  )
}
