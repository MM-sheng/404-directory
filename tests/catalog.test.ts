import { describe, expect, it } from "vitest"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import {
  searchCatalogTools,
  compareCatalogTools,
} from "../src/domain/discovery.js"
import { computeTrustProfile } from "../src/domain/trust.js"
import { RegisterToolRequestSchema } from "../src/domain/types.js"
import { verifyTool } from "../src/domain/verification.js"

describe("catalog registry + discovery", () => {
  it("validates registration payloads", () => {
    const parsed = RegisterToolRequestSchema.parse({
      name: "btc_analyzer",
      description: "Analyze BTC market signals for agents",
      capabilities: ["btc", "market-analysis"],
      protocol: "mcp",
      endpoint: "https://example.com/mcp",
      version: "1.0.0",
      provider: {
        name: "Example Labs",
        identity: { type: "domain", value: "example.com" },
      },
    })
    expect(parsed.authentication).toBe("none")
    expect(parsed.capabilities).toContain("btc")
  })

  it("registers, searches, and compares tools in memory", async () => {
    const store = new MemoryCatalogStore()
    const tool = await store.registerTool({
      name: "btc_analyzer",
      description: "Analyze BTC market signals for agents",
      capabilities: ["btc", "market-analysis"],
      protocol: "mcp",
      endpoint: "https://example.com/mcp",
      category: "finance",
      version: "1.0.0",
      authentication: "none",
      provider: {
        name: "Example Labs",
        identity: { type: "domain", value: "example.com" },
      },
    })

    expect(tool.slug).toBe("btc_analyzer")
    expect(tool.status).toBe("pending")

    await store.setToolStatus(tool.id, "active")

    const results = await searchCatalogTools(store, {
      capability: "btc",
      protocol: "mcp",
      limit: 10,
    })
    expect(results).toHaveLength(1)
    expect(results[0]?.name).toBe("btc_analyzer")

    const compared = await compareCatalogTools(store, ["btc_analyzer"])
    expect(compared[0]?.id).toBe(tool.id)
  })

  it("computes a multi-dimensional trust profile", () => {
    const profile = computeTrustProfile({
      providerVerified: true,
      checks: [
        {
          id: "1",
          tool_id: "t",
          endpoint_id: "e",
          check_type: "endpoint_availability",
          status: "pass",
          latency_ms: 120,
          evidence: {},
          checked_at: new Date().toISOString(),
        },
        {
          id: "2",
          tool_id: "t",
          endpoint_id: "e",
          check_type: "tls_security",
          status: "pass",
          latency_ms: null,
          evidence: {},
          checked_at: new Date().toISOString(),
        },
        {
          id: "3",
          tool_id: "t",
          endpoint_id: "e",
          check_type: "mcp_handshake",
          status: "pass",
          latency_ms: 200,
          evidence: {},
          checked_at: new Date().toISOString(),
        },
      ],
      usage: { invocations: 20, successes: 18 },
    })

    expect(profile.algorithm_version).toBe("v1")
    expect(profile.ownership_score).toBeGreaterThan(0.5)
    expect(profile.security_score).toBe(1)
    expect(profile.overall_score).toBeGreaterThan(0.4)
    expect(profile.factors).toHaveProperty("weights")
  })

  it("records verification checks and refreshes trust", async () => {
    const store = new MemoryCatalogStore()
    const tool = await store.registerTool({
      name: "demo_api",
      description: "A public demo HTTP API for agents",
      capabilities: ["demo"],
      protocol: "api",
      endpoint: "https://example.com/",
      version: "0.1.0",
      authentication: "none",
      provider: {
        name: "Demo",
        identity: { type: "domain", value: "example.com" },
      },
    })

    const results = await verifyTool(store, tool.id)
    expect(results.length).toBeGreaterThan(0)
    const checks = await store.listVerificationChecks(tool.id)
    expect(checks.length).toBe(results.length)

    const refreshed = await store.getToolById(tool.id)
    expect(refreshed?.trust?.algorithm_version).toBe("v1")
  })
})
