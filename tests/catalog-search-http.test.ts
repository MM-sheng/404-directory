import { describe, expect, it } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { buildApp } from "../src/http/app.js"
import { loadConfig } from "../src/config.js"
import { ToolRegistry } from "../src/tools/registry.js"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import { seedSearchCorpus } from "./fixtures/search-corpus.js"

describe("first-call HTTP and MCP catalog search", () => {
  it("completes initialize, tool discovery, keyword search and contextual preflight over local Streamable HTTP", async () => {
    const store = new MemoryCatalogStore()
    await seedSearchCorpus(store)
    const app = await buildApp(
      new ToolRegistry(),
      loadConfig({
        REGISTRY_ADMIN_TOKEN: "local-search-admin-only",
        AGENT_ANALYTICS_SALT: "local-search-regression-only",
        MCP_GATEWAY_ENABLED: "false",
      }),
      store
    )
    const client = new Client({
      name: "404-local-search-acceptance",
      version: "1",
    })
    try {
      const baseUrl = await app.listen({ host: "127.0.0.1", port: 0 })
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
          requestInit: {
            headers: {
              "X-404-Agent-Class": "internal",
              "X-404-Agent-ID": "internal:local-search-acceptance",
            },
          },
        })
      )
      const tool = (await client.listTools()).tools.find(
        (item) => item.name === "search_tools"
      )
      expect(tool?.description).toContain("official documentation")
      expect(tool?.inputSchema.properties?.q).toHaveProperty("description")
      const searched = await client.callTool({
        name: "search_tools",
        arguments: {
          q: "official documentation",
          protocol: "mcp",
          category: "search-regression",
          limit: 1,
        },
      })
      expect(searched.isError).not.toBe(true)
      expect(searched.structuredContent).toMatchObject({
        count: 1,
        tools: [expect.objectContaining({ slug: "alpha_docs" })],
      })
      const preflight = await client.callTool({
        name: "evaluate_tool_risk",
        arguments: {
          target: "alpha_docs",
          action: "invoke",
          data_sensitivity: "public",
          execution_mode: "supervised",
          permissions: ["public_network"],
        },
      })
      expect(preflight.isError).not.toBe(true)
      expect(preflight.structuredContent).toMatchObject({
        target: { slug: "alpha_docs" },
        decision: expect.stringMatching(/^(allow|review|block)$/),
      })
      expect((await store.agentUsageSummary()).identified_external_agents).toBe(
        0
      )
    } finally {
      await client.close()
      await app.close()
    }
  })

  it("gives actionable no-match guidance without activating an identity, then returns useful candidates", async () => {
    const store = new MemoryCatalogStore()
    await seedSearchCorpus(store)
    const app = await buildApp(
      new ToolRegistry(),
      loadConfig({
        REGISTRY_ADMIN_TOKEN: "local-search-admin-only",
        AGENT_ANALYTICS_SALT: "local-search-regression-only",
        MCP_GATEWAY_ENABLED: "false",
      }),
      store
    )
    const rpc = async (args: object) => {
      const response = await app.inject({
        method: "POST",
        url: "/mcp",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-protocol-version": "2025-11-25",
          "x-404-agent-id": "agent:search-regression-0001",
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "search_tools", arguments: args },
        },
      })
      expect(response.statusCode).toBe(200)
      const data = response.body
        .split("\n")
        .find((line) => line.startsWith("data: "))
      return JSON.parse(data ? data.slice(6) : response.body).result
    }
    try {
      const args = {
        q: "official documentation unknownintent",
        protocol: "mcp",
        category: "search-regression",
        trust_threshold: 0.3,
        limit: 3,
      }
      const empty = await rpc(args)
      expect(empty.isError).not.toBe(true) // Valid empty search, not a transport/tool exception.
      expect(empty.structuredContent).toMatchObject({
        count: 0,
        tools: [],
        search: {
          result_status: "no_matches",
          algorithm_version: "catalog-lexical-v2",
        },
        recovery: {
          code: "no_matching_catalog_tools",
          filters_preserved: true,
          next_step: {
            mcp_tool: "list_capabilities",
            http_path: "/v1/capabilities",
          },
        },
      })
      expect(await store.agentUsageSummary()).toMatchObject({
        identified_external_agents: 0,
        successful_external_invocations: 0,
      })
      expect((await store.activationFunnelSummary()).stages).toContainEqual(
        expect.objectContaining({ stage: "failed_tool", events: 1 })
      )
      const restEmpty = await app.inject({
        method: "GET",
        url: "/v1/tools/search",
        query: { ...args, limit: "3", trust_threshold: "0.3" },
      })
      expect(restEmpty.json()).toMatchObject({
        ...empty.structuredContent,
        query: { ...args, status: "active" },
      })

      const found = await rpc({ ...args, q: "official documentation" })
      expect(
        found.structuredContent.tools.map((tool: { slug: string }) => tool.slug)
      ).toEqual(["alpha_docs", "beta_docs", "degraded_docs"])
      expect(found.structuredContent).not.toHaveProperty("recovery")
      expect(await store.agentUsageSummary()).toMatchObject({
        identified_external_agents: 1,
        successful_external_invocations: 1,
      })
      const rest = await app.inject({
        method: "GET",
        url: "/v1/tools/search",
        query: {
          q: "official documentation",
          protocol: "mcp",
          category: "search-regression",
          trust_threshold: "0.3",
          limit: "3",
        },
      })
      expect(
        rest.json().tools.map((tool: { slug: string }) => tool.slug)
      ).toEqual(
        found.structuredContent.tools.map((tool: { slug: string }) => tool.slug)
      )
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/v1/tools/search?status=pending&capability=documentation-search",
          })
        ).statusCode
      ).toBe(403)
      expect(
        (await app.inject({ method: "GET", url: "/v1/capabilities" }))
          .statusCode
      ).toBe(200)
    } finally {
      await app.close()
    }
  })
})
