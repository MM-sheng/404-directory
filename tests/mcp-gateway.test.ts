import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import { seedCuratedMcpServers } from "../src/domain/seed-curated-mcp.js"
import { createMcpServerFromRegistry } from "../src/mcp/create-server.js"
import type { RemoteMcpGateway } from "../src/mcp/remote-gateway.js"
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
})
