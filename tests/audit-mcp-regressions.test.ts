import type { FastifyInstance } from "fastify"
import { afterEach, describe, expect, it } from "vitest"
import { loadConfig } from "../src/config.js"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import { buildApp } from "../src/http/app.js"
import { ToolRegistry } from "../src/tools/registry.js"
import { seedCuratedMcpServers } from "../src/domain/seed-curated-mcp.js"

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

async function setup() {
  const store = new MemoryCatalogStore()
  app = await buildApp(
    new ToolRegistry(),
    loadConfig({
      REGISTRY_ADMIN_TOKEN: "local-regression-admin-token-only",
      AGENT_ANALYTICS_SALT: "local-regression-analytics-salt-only",
      MCP_GATEWAY_ENABLED: "false",
      TOOL_RATE_LIMIT_MAX: "100",
    }),
    store
  )
  return store
}

async function rpc(method: string, params: Record<string, unknown>) {
  const response = await app!.inject({
    method: "POST",
    url: "/mcp",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": "2025-11-25",
      "x-404-agent-id": "agent:audit-regression-external-0001",
      "x-404-client-name": "regression-client",
    },
    payload: { jsonrpc: "2.0", id: 1, method, params },
  })
  expect(response.statusCode).toBe(200)
  const data = response.body
    .split("\n")
    .find((line) => line.startsWith("data: "))
  return JSON.parse(data ? data.slice(6) : response.body)
}

describe("audit regressions over HTTP MCP", () => {
  it("keeps a valid recommendation with no neighbors successful", async () => {
    const store = await setup()
    await seedCuratedMcpServers(store)
    const tool = await store.getToolBySlug("openai_docs_mcp")
    await store.setToolStatus(tool!.id, "active")
    const response = await rpc("tools/call", {
      name: "recommend_tools",
      arguments: { id_or_slug: tool!.slug },
    })
    expect(response.result.isError).not.toBe(true)
    expect(response.result.structuredContent).toMatchObject({
      count: 0,
      related: [],
    })
    expect(await store.agentUsageSummary()).toMatchObject({
      identified_external_agents: 1,
      successful_external_invocations: 1,
    })
  })
  it.each([
    "get_tool",
    "get_trust_score",
    "recommend_tools",
    "report_prediction_market_outcome",
  ])(
    "%s failures never activate an Agent or count as successful execution",
    async (name) => {
      const store = await setup()
      const args =
        name === "report_prediction_market_outcome"
          ? {
              receipt_id: "00000000-0000-0000-0000-000000000000",
              outcome_token: "a".repeat(32),
              action_taken: "aborted",
              execution_result: "not_executed",
            }
          : { id_or_slug: "not_registered" }
      const response = await rpc("tools/call", { name, arguments: args })
      expect(response.result.isError).toBe(true)
      expect(await store.agentUsageSummary()).toMatchObject({
        identified_external_agents: 0,
        successful_external_invocations: 0,
        anonymous_successful_invocations: 0,
      })
      const funnel = await store.activationFunnelSummary()
      expect(funnel.stages).toContainEqual(
        expect.objectContaining({ stage: "failed_tool", events: 1 })
      )
      // A normal non-error result still activates the same identity once.
      expect(
        (await rpc("tools/call", { name: "list_capabilities", arguments: {} }))
          .result.isError
      ).not.toBe(true)
      expect(await store.agentUsageSummary()).toMatchObject({
        identified_external_agents: 1,
        successful_external_invocations: 1,
      })
    }
  )

  it("preserves explicitly supplied permission lists in a standard prompt request", async () => {
    const store = await setup()
    for (const permissions of [
      "public_network",
      "public_network, credentials",
      '["public_network","credentials"]',
      "[]",
    ]) {
      const response = await rpc("prompts/get", {
        name: "evaluate-agent-tool",
        arguments: {
          capability: "documentation-search",
          permissions,
        },
      })
      expect(response.error).toBeUndefined()
      const expected = permissions.startsWith("[")
        ? JSON.parse(permissions)
        : permissions.split(",").map((value) => value.trim())
      expect(response.result.messages[0].content.text).toContain(
        `"permissions":${JSON.stringify(expected)}`
      )
    }
    expect(await store.agentUsageSummary()).toMatchObject({
      identified_external_agents: 0,
    })
  })

  it.each([
    "",
    "not_a_permission",
    "[",
    '["unknown"]',
    JSON.stringify(Array(9).fill("public_network")),
  ])(
    "rejects invalid permission strings without silently removing context: %s",
    async (permissions) => {
      await setup()
      const response = await rpc("prompts/get", {
        name: "evaluate-agent-tool",
        arguments: {
          capability: "documentation-search",
          permissions,
        },
      })
      expect(response.error).toBeDefined()
      expect(response.result).toBeUndefined()
    }
  )

  it("requires explicit permission context instead of silently assuming none", async () => {
    await setup()
    const response = await rpc("prompts/get", {
      name: "evaluate-agent-tool",
      arguments: { capability: "documentation-search" },
    })
    expect(response.error).toBeDefined()
  })
})
