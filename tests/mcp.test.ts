import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { createMcpServerFromRegistry } from "../src/mcp/create-server.js"
import { createVerifyWebTool } from "../src/tools/definitions/verify-web.js"
import { ToolRegistry } from "../src/tools/registry.js"
import type { ToolDefinition } from "../src/tools/types.js"

const clients: Client[] = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

async function connect(registry: ToolRegistry): Promise<Client> {
  const server = createMcpServerFromRegistry(registry)
  const client = new Client({ name: "test-client", version: "1.0.0" })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ])
  clients.push(client)
  return client
}

describe("registry MCP adapter", () => {
  it("tells clients not to pair verify_web with page understanding", async () => {
    const registry = new ToolRegistry().register(
      createVerifyWebTool({
        timeoutMs: 2_000,
        maxBodyBytes: 1_024,
        maxRedirects: 2,
      })
    )
    const client = await connect(registry)

    expect(client.getServerVersion()).toMatchObject({
      name: "404.directory",
      title: "404.directory — Agent Discovery + Trust",
      description: expect.stringContaining("AI Agent tools"),
      websiteUrl: "https://404.directory",
    })

    const instructions = client.getInstructions()
    expect(instructions).toContain("Do not call verify_web merely")

    const tools = await client.listTools()
    const verify = tools.tools.find((tool) => tool.name === "verify_web")
    expect(verify?.description).toContain(
      "Do not call this merely before or alongside understand_webpage"
    )
  })

  it("returns verify_web evidence as structured content", async () => {
    const registry = new ToolRegistry().register(
      createVerifyWebTool({
        timeoutMs: 2_000,
        maxBodyBytes: 1_024,
        maxRedirects: 2,
        resolveUrl: async (input) => ({
          url: new URL(input),
          addresses: [{ address: "93.184.216.34", family: 4 }],
        }),
        requestUrl: async () => ({
          status: 200,
          body: "Example Domain",
        }),
      })
    )
    const client = await connect(registry)

    const result = await client.callTool({
      name: "verify_web",
      arguments: {
        url: "https://example.com",
        expected_status: 200,
        expected_text: "Example Domain",
      },
    })

    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      verified: true,
      evidence: {
        http: { status: 200, expected_status: 200, matched: true },
        claims: expect.arrayContaining([
          expect.objectContaining({ claim: "status_matches", passed: true }),
        ]),
      },
    })
  })

  it("does not expose handler exception details to MCP clients", async () => {
    const input = z.object({ value: z.string() }).strict()
    const output = z.object({ ok: z.boolean() }).strict()
    const failingTool: ToolDefinition<typeof input, typeof output> = {
      name: "failing_tool",
      description:
        "Test tool that always fails so the MCP adapter can prove internal errors are sanitized.",
      use_when: "Only in automated tests.",
      do_not_use_when: "Outside automated tests.",
      version: "1.0.0",
      endpoint: "/failing",
      method: "POST",
      status: "active",
      read_only: true,
      side_effects: [],
      requires_auth: false,
      cost: "free",
      typical_latency_ms: 1,
      examples: [],
      inputSchema: input,
      outputSchema: output,
      handler: async () => {
        throw new Error("secret internal path /srv/private")
      },
    }
    const client = await connect(new ToolRegistry().register(failingTool))

    const result = await client.callTool({
      name: "failing_tool",
      arguments: { value: "test" },
    })

    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain("Tool execution failed")
    expect(JSON.stringify(result.content)).not.toContain("/srv/private")
  })
})
