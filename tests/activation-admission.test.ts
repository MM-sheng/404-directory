import { describe, expect, it } from "vitest"
import { getCatalogTool } from "../src/domain/discovery.js"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import { meetsActivationCriteria } from "../src/domain/verification.js"

describe("activation admission", () => {
  it("rejects 404/401 availability as API admission", () => {
    expect(
      meetsActivationCriteria({
        providerVerified: true,
        transport: "http",
        results: [
          {
            check_type: "tls_security",
            status: "pass",
            latency_ms: null,
            evidence: {},
          },
          {
            check_type: "endpoint_availability",
            status: "fail",
            latency_ms: 10,
            evidence: { http_status: 404 },
          },
        ],
      })
    ).toBe(false)
  })

  it("requires MCP handshake and tools/list, not bare availability", () => {
    expect(
      meetsActivationCriteria({
        providerVerified: true,
        transport: "mcp_http",
        results: [
          {
            check_type: "tls_security",
            status: "pass",
            latency_ms: null,
            evidence: {},
          },
          {
            check_type: "endpoint_availability",
            status: "pass",
            latency_ms: 10,
            evidence: {},
          },
          {
            check_type: "mcp_handshake",
            status: "fail",
            latency_ms: 10,
            evidence: {},
          },
          {
            check_type: "tools_list",
            status: "error",
            latency_ms: null,
            evidence: {},
          },
        ],
      })
    ).toBe(false)

    expect(
      meetsActivationCriteria({
        providerVerified: true,
        transport: "mcp_http",
        results: [
          {
            check_type: "tls_security",
            status: "pass",
            latency_ms: null,
            evidence: {},
          },
          {
            check_type: "mcp_handshake",
            status: "pass",
            latency_ms: 100,
            evidence: {},
          },
          {
            check_type: "tools_list",
            status: "pass",
            latency_ms: 120,
            evidence: { tools_count: 2 },
          },
        ],
      })
    ).toBe(true)
  })

  it("hides pending tools from public getCatalogTool", async () => {
    const store = new MemoryCatalogStore()
    const tool = await store.registerTool({
      name: "pending_mcp",
      description: "Pending MCP tool for quarantine tests",
      capabilities: ["x"],
      protocol: "mcp",
      endpoint: "https://example.com/mcp",
      version: "1.0.0",
      authentication: "none",
      provider: {
        name: "P",
        identity: { type: "domain", value: "example.com" },
      },
    })
    expect(await getCatalogTool(store, tool.slug)).toBeNull()
    expect(
      await getCatalogTool(store, tool.slug, { includeQuarantine: true })
    ).toMatchObject({ slug: "pending_mcp", status: "pending" })
  })

  it("claims verification tools oldest-first and leases them", async () => {
    const store = new MemoryCatalogStore()
    const a = await store.registerTool({
      name: "tool_a",
      description: "First tool for scheduler ordering tests",
      capabilities: ["a"],
      protocol: "api",
      endpoint: "https://example.com/a",
      version: "1.0.0",
      authentication: "none",
      provider: {
        name: "A",
        slug: "sched-a",
        identity: { type: "domain", value: "a.example" },
      },
    })
    const b = await store.registerTool({
      name: "tool_b",
      description: "Second tool for scheduler ordering tests",
      capabilities: ["b"],
      protocol: "api",
      endpoint: "https://example.com/b",
      version: "1.0.0",
      authentication: "none",
      provider: {
        name: "B",
        slug: "sched-b",
        identity: { type: "domain", value: "b.example" },
      },
    })
    await store.completeVerificationAttempt(a.id, { success: true })
    const firstBatch = await store.claimToolsForVerification(1, 60_000)
    expect(firstBatch).toEqual([b.id])
    // a deferred by success backoff; b still leased → empty due set
    expect(await store.claimToolsForVerification(10, 60_000)).toEqual([])
  })
})
