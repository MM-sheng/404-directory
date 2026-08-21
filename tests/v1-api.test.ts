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

describe("v1 discovery API", () => {
  it("registers with auth and exposes tools after activation", async () => {
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
    expect(created.json().tool.slug).toBe("btc_analyzer")
    expect(created.json().tool.status).toBe("pending")

    await store.setProviderVerified("example-labs", true, {
      ownership_method: "dns_txt",
    })
    await store.setToolStatus(created.json().tool.id, "active")

    const search = await app.inject({
      method: "GET",
      url: "/v1/tools/search?capability=btc&protocol=mcp",
    })
    expect(search.statusCode).toBe(200)
    expect(search.json().count).toBe(1)
    expect(search.json().tools[0].name).toBe("btc_analyzer")

    const one = await app.inject({
      method: "GET",
      url: "/v1/tools/btc_analyzer",
    })
    expect(one.statusCode).toBe(200)
    expect(one.json().tool.capabilities).toContain("btc")

    const trust = await app.inject({
      method: "GET",
      url: "/v1/tools/btc_analyzer/trust",
    })
    expect(trust.statusCode).toBe(200)
    expect(trust.json().trust).toMatchObject({
      algorithm_version: "v1",
      overall_score: expect.any(Number),
    })
  })

  it("keeps first-party /tools working without catalog changes", async () => {
    app = await buildApp(
      tinyRegistry(),
      testConfig(),
      new MemoryCatalogStore()
    )
    const tools = await app.inject({ method: "GET", url: "/tools" })
    expect(tools.statusCode).toBe(200)
    expect(
      tools.json().tools.some((t: { name: string }) => t.name === "echo_tool")
    ).toBe(true)
  })
})
