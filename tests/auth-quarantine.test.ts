import { afterEach, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { buildApp } from "../src/http/app.js"
import { loadConfig } from "../src/config.js"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import { ToolRegistry } from "../src/tools/registry.js"
import type { ToolDefinition } from "../src/tools/types.js"
import { z } from "zod"

const EchoIn = z.object({ value: z.string() }).strict()
const EchoOut = z.object({ value: z.string() }).strict()

function tinyRegistry(): ToolRegistry {
  const echo: ToolDefinition = {
    name: "echo_tool",
    description: "Echo",
    use_when: "tests",
    do_not_use_when: "production",
    version: "0.0.1",
    endpoint: "/echo",
    method: "POST",
    status: "active",
    read_only: true,
    side_effects: [],
    requires_auth: false,
    cost: "free",
    typical_latency_ms: 10,
    examples: [
      { description: "echo", input: { value: "a" }, output: { value: "a" } },
    ],
    inputSchema: EchoIn,
    outputSchema: EchoOut,
    handler: async (input) => input,
  }
  return new ToolRegistry().register(echo)
}

function testConfig() {
  return loadConfig({
    REGISTRY_REQUIRE_AUTH: "true",
    REGISTRY_ADMIN_TOKEN: "test-admin-token-16chars",
  })
}

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe("v1 auth + quarantine", () => {
  it("rejects anonymous registry writes", async () => {
    const store = new MemoryCatalogStore()
    app = await buildApp(tinyRegistry(), testConfig(), store)

    const created = await app.inject({
      method: "POST",
      url: "/v1/tools",
      payload: {
        name: "btc_analyzer",
        description: "Analyze BTC market signals for agents",
        capabilities: ["btc"],
        protocol: "mcp",
        endpoint: "https://example.com/mcp",
        provider: {
          name: "Example Labs",
          identity: { type: "domain", value: "example.com" },
        },
      },
    })
    expect(created.statusCode).toBe(401)
  })

  it("issues provider API key once and quarantines pending from search", async () => {
    const store = new MemoryCatalogStore()
    app = await buildApp(tinyRegistry(), testConfig(), store)

    const created = await app.inject({
      method: "POST",
      url: "/v1/tools",
      headers: { authorization: "Bearer test-admin-token-16chars" },
      payload: {
        name: "btc_analyzer",
        description: "Analyze BTC market signals for agents",
        capabilities: ["btc", "market-analysis"],
        protocol: "mcp",
        endpoint: "https://example.com/mcp",
        category: "finance",
        provider: {
          name: "Example Labs",
          slug: "example-labs",
          identity: { type: "domain", value: "example.com" },
        },
      },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().tool.status).toBe("pending")
    expect(created.json().provider_api_key).toMatch(/^404_/)

    const search = await app.inject({
      method: "GET",
      url: "/v1/tools/search?capability=btc",
    })
    expect(search.statusCode).toBe(200)
    expect(search.json().count).toBe(0)

    const quarantine = await app.inject({
      method: "GET",
      url: "/v1/tools/search?capability=btc&status=pending",
      headers: { authorization: "Bearer test-admin-token-16chars" },
    })
    expect(quarantine.statusCode).toBe(200)
    expect(quarantine.json().count).toBe(1)
  })

  it("blocks registering under another provider without their key", async () => {
    const store = new MemoryCatalogStore()
    app = await buildApp(tinyRegistry(), testConfig(), store)

    const first = await app.inject({
      method: "POST",
      url: "/v1/tools",
      headers: { authorization: "Bearer test-admin-token-16chars" },
      payload: {
        name: "tool_one",
        description: "First tool for ownership binding tests",
        capabilities: ["one"],
        protocol: "api",
        endpoint: "https://example.com/one",
        provider: {
          name: "Labs",
          slug: "labs",
          identity: { type: "domain", value: "example.com" },
        },
      },
    })
    const providerKey = first.json().provider_api_key as string

    const spoof = await app.inject({
      method: "POST",
      url: "/v1/tools",
      headers: { authorization: `Bearer ${providerKey}` },
      payload: {
        name: "tool_two",
        description: "Second tool attempting provider spoof",
        capabilities: ["two"],
        protocol: "api",
        endpoint: "https://evil.example/two",
        provider: {
          name: "Other",
          slug: "other-labs",
          identity: { type: "domain", value: "evil.example" },
        },
      },
    })
    expect(spoof.statusCode).toBe(403)
  })
})
