import { describe, expect, it } from "vitest"
import { nextLifecycleStatus } from "../src/domain/lifecycle.js"
import { RegisterToolRequestSchema } from "../src/domain/types.js"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import { buildApp } from "../src/http/app.js"
import { loadConfig } from "../src/config.js"
import { ToolRegistry } from "../src/tools/registry.js"
import type { ToolDefinition } from "../src/tools/types.js"
import { z } from "zod"
import type { FastifyInstance } from "fastify"
import { afterEach } from "vitest"

describe("lifecycle + registration gates", () => {
  it("degrades then suspends active tools on repeated failures", () => {
    expect(
      nextLifecycleStatus({
        current: "active",
        admitted: false,
        securityFail: false,
        failCount: 2,
        successStreak: 0,
      })
    ).toBe("degraded")

    expect(
      nextLifecycleStatus({
        current: "degraded",
        admitted: false,
        securityFail: false,
        failCount: 4,
        successStreak: 0,
      })
    ).toBe("suspended")
  })

  it("suspends immediately on security failure", () => {
    expect(
      nextLifecycleStatus({
        current: "active",
        admitted: false,
        securityFail: true,
        failCount: 1,
        successStreak: 0,
      })
    ).toBe("suspended")
  })

  it("rejects mcp_stdio registration", () => {
    const parsed = RegisterToolRequestSchema.safeParse({
      name: "stdio_tool",
      description: "Should not accept stdio transport for third parties",
      capabilities: ["x"],
      protocol: "mcp",
      endpoint: "https://example.com/mcp",
      transport: "mcp_stdio",
      provider: {
        name: "X",
        identity: { type: "domain", value: "example.com" },
      },
    })
    expect(parsed.success).toBe(false)
  })

  it("requires public verification contract for authenticated tools", () => {
    const parsed = RegisterToolRequestSchema.safeParse({
      name: "keyed_api",
      description: "Authenticated API without public verification probe",
      capabilities: ["x"],
      protocol: "api",
      endpoint: "https://example.com/private",
      authentication: "api_key",
      provider: {
        name: "X",
        identity: { type: "domain", value: "example.com" },
      },
    })
    expect(parsed.success).toBe(false)
  })
})

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

describe("receipts disabled", () => {
  let app: FastifyInstance | undefined
  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  it("rejects anonymous POST /v1/receipts", async () => {
    app = await buildApp(
      tinyRegistry(),
      loadConfig({
        REGISTRY_REQUIRE_AUTH: "true",
        REGISTRY_ADMIN_TOKEN: "test-admin-token-16chars",
      }),
      new MemoryCatalogStore()
    )
    const res = await app.inject({
      method: "POST",
      url: "/v1/receipts",
      payload: {
        selected_slug: "verify_web",
        outcome: "success",
        discovery_query: { prompt: "should not be stored" },
      },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe("receipts_disabled")
  })
})
