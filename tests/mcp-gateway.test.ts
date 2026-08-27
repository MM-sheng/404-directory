import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import { seedCuratedMcpServers } from "../src/domain/seed-curated-mcp.js"
import { createMcpServerFromRegistry } from "../src/mcp/create-server.js"
import {
  GatewayError,
  type RemoteMcpGateway,
} from "../src/mcp/remote-gateway.js"
import { ToolRegistry } from "../src/tools/registry.js"

const clients: Client[] = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

describe("curated remote MCP gateway", () => {
  it("inspects and invokes only approved read-only remote tools", async () => {
    const store = new MemoryCatalogStore()
    await seedCuratedMcpServers(store)
    const catalogServer = await store.getToolBySlug("openai_docs_mcp")
    expect(catalogServer?.status).toBe("pending")
    expect(catalogServer?.provider.verified).toBe(true)
    await store.setToolStatus(catalogServer!.id, "active")

    const invoke = vi.fn(async () => ({
      is_error: false,
      content: [{ type: "text", text: "current official result" }],
      truncated: false,
    }))
    const gateway: RemoteMcpGateway = {
      inspect: vi.fn(async () => [
        {
          name: "search_openai_docs",
          description: "Search current OpenAI documentation.",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
          annotations: { readOnlyHint: true, destructiveHint: false },
        },
      ]),
      invoke,
    }

    const server = createMcpServerFromRegistry(
      new ToolRegistry(),
      store,
      gateway
    )
    const client = new Client({ name: "gateway-test-agent", version: "1.0" })
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ])
    clients.push(client)

    const listed = await client.listTools()
    expect(listed.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "search_tools",
        "inspect_tool_server",
        "invoke_registered_tool",
      ])
    )

    const inspected = await client.callTool({
      name: "inspect_tool_server",
      arguments: { id_or_slug: "openai_docs_mcp" },
    })
    expect(inspected.isError).not.toBe(true)
    expect(JSON.stringify(inspected.content)).toContain("search_openai_docs")

    const invoked = await client.callTool({
      name: "invoke_registered_tool",
      arguments: {
        server_id_or_slug: "openai_docs_mcp",
        tool_name: "search_openai_docs",
        arguments: { query: "Responses API tools" },
      },
    })
    expect(invoked.isError).not.toBe(true)
    expect(JSON.stringify(invoked.content)).toContain("current official result")
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "openai_docs_mcp" }),
      "search_openai_docs",
      { query: "Responses API tools" }
    )

    const denied = await client.callTool({
      name: "invoke_registered_tool",
      arguments: {
        server_id_or_slug: "openai_docs_mcp",
        tool_name: "delete_everything",
        arguments: {},
      },
    })
    expect(denied.isError).toBe(true)
    expect(JSON.stringify(denied.content)).toContain("remote_tool_not_allowed")
    expect(invoke).toHaveBeenCalledTimes(1)

    const usage = await store.usageStats(catalogServer!.id)
    expect(usage).toEqual({ invocations: 3, successes: 2 })
    const gatewayInvocations = (
      store as unknown as {
        invocations: Array<{
          tool_name: string
          success: boolean
          result_count?: number | null
        }>
      }
    ).invocations.filter((event) =>
      ["inspect_tool_server", "invoke_registered_tool"].includes(
        event.tool_name
      )
    )
    expect(gatewayInvocations).toEqual([
      expect.objectContaining({
        tool_name: "inspect_tool_server",
        success: true,
        result_count: 1,
      }),
      expect.objectContaining({
        tool_name: "invoke_registered_tool",
        success: true,
        result_count: 1,
      }),
      expect.objectContaining({
        tool_name: "invoke_registered_tool",
        success: false,
        result_count: 0,
      }),
    ])
  })

  it("does not execute pending curated servers", async () => {
    const store = new MemoryCatalogStore()
    await seedCuratedMcpServers(store)
    const gateway: RemoteMcpGateway = {
      inspect: vi.fn(),
      invoke: vi.fn(),
    }
    const server = createMcpServerFromRegistry(
      new ToolRegistry(),
      store,
      gateway
    )
    const client = new Client({ name: "gateway-test-agent", version: "1.0" })
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ])
    clients.push(client)

    const result = await client.callTool({
      name: "inspect_tool_server",
      arguments: { id_or_slug: "aws_knowledge_mcp" },
    })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain("unknown_server")
    expect(gateway.inspect).not.toHaveBeenCalled()
  })

  it("searches multiple official documentation providers in one call and preserves partial results", async () => {
    const store = new MemoryCatalogStore()
    await seedCuratedMcpServers(store)
    for (const slug of ["openai_docs_mcp", "aws_knowledge_mcp"]) {
      const catalogServer = await store.getToolBySlug(slug)
      await store.setToolStatus(catalogServer!.id, "active")
    }

    const invoke = vi.fn(
      async (catalogServer: { slug: string }, remoteToolName: string) => {
        if (catalogServer.slug === "aws_knowledge_mcp") {
          throw new GatewayError(
            "remote_rate_limited",
            "AWS documentation search is temporarily rate limited."
          )
        }
        return {
          is_error: false,
          content: [
            {
              type: "text",
              text: `official result from ${remoteToolName}`,
            },
          ],
          truncated: false,
        }
      }
    )
    const gateway: RemoteMcpGateway = {
      inspect: vi.fn(),
      invoke,
    }
    const server = createMcpServerFromRegistry(
      new ToolRegistry(),
      store,
      gateway
    )
    const client = new Client({ name: "docs-test-agent", version: "1.0" })
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ])
    clients.push(client)

    const result = await client.callTool({
      name: "search_official_docs",
      arguments: {
        query: "remote MCP support",
        sources: ["openai", "aws"],
        limit_per_source: 3,
      },
    })

    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      requested_sources: ["openai", "aws"],
      successful_sources: ["openai"],
      failed_sources: [
        expect.objectContaining({
          source: "aws",
          error_type: "remote_rate_limited",
        }),
      ],
      results: [
        expect.objectContaining({
          source: "openai",
          server: "openai_docs_mcp",
          remote_tool: "search_openai_docs",
        }),
      ],
    })
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "openai_docs_mcp" }),
      "search_openai_docs",
      { query: "remote MCP support", limit: 3 }
    )
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "aws_knowledge_mcp" }),
      "aws___search_documentation",
      { search_phrase: "remote MCP support", limit: 3 }
    )
    expect(
      (
        store as unknown as {
          invocations: Array<Record<string, unknown>>
        }
      ).invocations
    ).toContainEqual(
      expect.objectContaining({
        tool_name: "search_official_docs",
        success: true,
        result_count: 1,
      })
    )
  })

  it("compacts raw documentation indexes into bounded citation packets", async () => {
    const store = new MemoryCatalogStore()
    await seedCuratedMcpServers(store)
    const catalogServer = await store.getToolBySlug("openai_docs_mcp")
    await store.setToolStatus(catalogServer!.id, "active")
    const hugeContent = "MCP transport details ".repeat(1_000)
    const gateway: RemoteMcpGateway = {
      inspect: vi.fn(),
      invoke: vi.fn(async () => ({
        is_error: false,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              hits: [
                {
                  url: "https://developers.openai.com/api/docs/guides/tools-connectors-mcp",
                  hierarchy: { lvl1: "MCP and Connectors" },
                  content: hugeContent,
                },
              ],
            }),
          },
        ],
        truncated: false,
      })),
    }
    const server = createMcpServerFromRegistry(
      new ToolRegistry(),
      store,
      gateway
    )
    const client = new Client({ name: "docs-compact-test", version: "1.0" })
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ])
    clients.push(client)

    const result = await client.callTool({
      name: "search_official_docs",
      arguments: {
        query: "MCP Streamable HTTP",
        sources: ["openai"],
        limit_per_source: 2,
      },
    })
    const payload = result.structuredContent as {
      results: Array<{
        documents: Array<{ title: string; url: string; snippet?: string }>
        content?: unknown
        truncated: boolean
      }>
    }
    expect(payload.results[0]).not.toHaveProperty("content")
    expect(payload.results[0]?.documents[0]).toMatchObject({
      title: "MCP and Connectors",
      url: "https://developers.openai.com/api/docs/guides/tools-connectors-mcp",
    })
    expect(payload.results[0]?.documents[0]?.snippet?.length).toBeLessThanOrEqual(
      600
    )
    expect(payload.results[0]?.truncated).toBe(true)
    expect(JSON.stringify(payload).length).toBeLessThan(2_000)
  })
})
