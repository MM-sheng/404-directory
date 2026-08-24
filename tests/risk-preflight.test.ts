import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import type { FastifyInstance } from "fastify"
import { afterEach, describe, expect, it } from "vitest"
import { loadConfig } from "../src/config.js"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import {
  evaluateToolRisk,
  getRiskEvaluationReceipt,
  reportRiskEvaluationOutcome,
} from "../src/domain/risk-evaluation.js"
import { buildApp } from "../src/http/app.js"
import { createMcpServerFromRegistry } from "../src/mcp/create-server.js"
import { ToolRegistry } from "../src/tools/registry.js"

const clients: Client[] = []
let app: FastifyInstance | undefined

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
  await app?.close()
  app = undefined
})

async function seededStore(options: { verified?: boolean } = {}) {
  const store = new MemoryCatalogStore()
  const tool = await store.ensureTool(
    {
      name: "safe_docs_mcp",
      description: "Read-only public documentation search for AI Agents",
      capabilities: ["documentation-search"],
      protocol: "mcp",
      endpoint: "https://example.com/mcp",
      transport: "mcp_http",
      authentication: "none",
      version: "1.0.0",
      provider: {
        name: "Example Docs",
        slug: "example-docs",
        identity: { type: "domain", value: "example.com" },
      },
    },
    { status: "active", providerVerified: options.verified ?? true }
  )

  for (const check_type of [
    "endpoint_availability",
    "mcp_handshake",
    "tools_list",
    "schema_consistency",
    "tls_security",
  ] as const) {
    await store.insertVerificationCheck({
      tool_id: tool.id,
      endpoint_id: null,
      check_type,
      status: "pass",
      latency_ms: 20,
      evidence: { test: true },
    })
  }
  return { store, tool }
}

describe("contextual Agent tool risk preflight", () => {
  it("allows a well-evidenced public read-only invocation and creates a safe receipt", async () => {
    const { store } = await seededStore()
    const evaluation = await evaluateToolRisk(store, {
      target: "safe_docs_mcp",
      action: "invoke",
      data_sensitivity: "public",
      execution_mode: "supervised",
      permissions: ["public_network"],
    })

    expect(evaluation).toMatchObject({
      decision: "allow",
      policy_version: "tool-preflight-v1",
      target: { slug: "safe_docs_mcp" },
      reason_codes: expect.arrayContaining(["LOW_RISK_PREFLIGHT_PASSED"]),
      outcome_reporting: { mcp_tool: "report_tool_outcome" },
    })
    expect(evaluation.confidence).toBeGreaterThanOrEqual(0.8)
    expect(evaluation.outcome_token.length).toBeGreaterThanOrEqual(32)

    const receipt = await getRiskEvaluationReceipt(store, evaluation.receipt_id)
    expect(receipt).not.toHaveProperty("outcome_token")
    expect(receipt).not.toHaveProperty("outcome_token_hash")
    expect(JSON.stringify(receipt)).not.toContain(evaluation.outcome_token)
  })

  it("blocks unsupported high-risk permissions and never treats missing evidence as safe", async () => {
    const { store } = await seededStore({ verified: false })
    const blocked = await evaluateToolRisk(store, {
      target: "safe_docs_mcp",
      action: "install",
      data_sensitivity: "restricted",
      execution_mode: "unattended",
      permissions: ["credentials", "destructive_actions"],
    })

    expect(blocked.decision).toBe("block")
    expect(blocked.reason_codes).toEqual(
      expect.arrayContaining([
        "HIGH_RISK_PERMISSION_OUT_OF_SCOPE",
        "RESTRICTED_DATA_OUT_OF_SCOPE",
        "PROVIDER_UNVERIFIED",
      ])
    )

    const elevated = await evaluateToolRisk(store, {
      target: "safe_docs_mcp",
      action: "invoke",
      data_sensitivity: "public",
      execution_mode: "supervised",
      permissions: ["local_files_read"],
    })
    expect(elevated.decision).toBe("review")
    expect(elevated.reason_codes).toContain(
      "ELEVATED_PERMISSION_REQUIRES_REVIEW"
    )

    const emptyStore = new MemoryCatalogStore()
    await emptyStore.ensureTool(
      {
        name: "unknown_evidence_mcp",
        description: "A tool without independent verification evidence",
        capabilities: ["testing"],
        protocol: "mcp",
        endpoint: "https://example.org/mcp",
        authentication: "none",
        version: "1.0.0",
        provider: {
          name: "Unknown Example",
          slug: "unknown-example",
          identity: { type: "domain", value: "example.org" },
        },
      },
      { status: "active", providerVerified: true }
    )
    const incomplete = await evaluateToolRisk(emptyStore, {
      target: "unknown_evidence_mcp",
      action: "invoke",
      data_sensitivity: "public",
      execution_mode: "supervised",
      permissions: [],
    })
    expect(incomplete.decision).toBe("review")
    expect(incomplete.reason_codes).toContain("EVIDENCE_INCOMPLETE")
    expect(incomplete.unknowns.length).toBeGreaterThan(0)
  })

  it("accepts one capability-bound self-reported outcome without changing trust", async () => {
    const { store } = await seededStore()
    const evaluation = await evaluateToolRisk(store, {
      target: "safe_docs_mcp",
      action: "invoke",
      data_sensitivity: "public",
      execution_mode: "supervised",
      permissions: [],
    })

    const first = await reportRiskEvaluationOutcome(
      store,
      evaluation.receipt_id,
      {
        outcome_token: evaluation.outcome_token,
        action_taken: "proceeded",
        result: "success",
      }
    )
    const replay = await reportRiskEvaluationOutcome(
      store,
      evaluation.receipt_id,
      {
        outcome_token: evaluation.outcome_token,
        action_taken: "proceeded",
        result: "success",
      }
    )
    const wrongToken = await reportRiskEvaluationOutcome(
      store,
      evaluation.receipt_id,
      {
        outcome_token: "x".repeat(32),
        action_taken: "aborted",
        result: "not_executed",
      }
    )

    expect(first).toBe("recorded")
    expect(replay).toBe("already_reported")
    expect(wrongToken).toBe("not_found")
    expect(
      (await getRiskEvaluationReceipt(store, evaluation.receipt_id))?.outcome
    ).toMatchObject({
      action_taken: "proceeded",
      result: "success",
      evidence_level: "self_reported",
    })
  })

  it("exposes the preflight and outcome loop through MCP", async () => {
    const { store } = await seededStore()
    const server = createMcpServerFromRegistry(new ToolRegistry(), store)
    const client = new Client({ name: "risk-test", version: "1.0.0" })
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ])
    clients.push(client)

    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["evaluate_tool_risk", "report_tool_outcome"])
    )
    const result = await client.callTool({
      name: "evaluate_tool_risk",
      arguments: {
        target: "safe_docs_mcp",
        action: "invoke",
        data_sensitivity: "public",
        execution_mode: "supervised",
        permissions: [],
      },
    })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({ decision: "allow" })
    const created = result.structuredContent as {
      receipt_id: string
      outcome_token: string
    }
    const reported = await client.callTool({
      name: "report_tool_outcome",
      arguments: {
        receipt_id: created.receipt_id,
        outcome_token: created.outcome_token,
        action_taken: "proceeded",
        result: "success",
      },
    })
    expect(reported.isError).not.toBe(true)
    expect(reported.structuredContent).toMatchObject({
      status: "recorded",
      evidence_level: "self_reported",
    })
    const invalid = await client.callTool({
      name: "report_tool_outcome",
      arguments: {
        receipt_id: created.receipt_id,
        outcome_token: "x".repeat(32),
        action_taken: "aborted",
        result: "not_executed",
      },
    })
    expect(invalid.isError).toBe(true)
    expect(JSON.stringify(invalid.content)).toContain("invalid_receipt")
  })

  it("exposes REST evaluation, public receipt, and one-time outcome reporting", async () => {
    const { store } = await seededStore()
    app = await buildApp(
      new ToolRegistry(),
      loadConfig({
        REGISTRY_REQUIRE_AUTH: "true",
        REGISTRY_ADMIN_TOKEN: "test-admin-token-16chars",
        AGENT_ANALYTICS_SALT: "test-agent-analytics-salt-123",
      }),
      store
    )
    const created = await app.inject({
      method: "POST",
      url: "/v1/evaluations",
      headers: {
        "x-404-agent-id": "agent:risk-preflight-test-0001",
        "x-404-client-name": "external-risk-test",
        "x-404-source": "risk-test",
      },
      payload: {
        target: "safe_docs_mcp",
        action: "invoke",
        permissions: ["public_network"],
      },
    })
    expect(created.statusCode).toBe(201)
    expect(created.headers["cache-control"]).toBe("no-store")
    expect(created.json()).toMatchObject({ decision: "allow" })

    const receipt = await app.inject({
      method: "GET",
      url: `/v1/evaluations/${created.json().receipt_id}`,
    })
    expect(receipt.statusCode).toBe(200)
    expect(receipt.headers["cache-control"]).toBe("no-store")
    expect(receipt.json()).not.toHaveProperty("outcome_token")

    const outcome = await app.inject({
      method: "POST",
      url: `/v1/evaluations/${created.json().receipt_id}/outcome`,
      payload: {
        outcome_token: created.json().outcome_token,
        action_taken: "proceeded",
        result: "success",
      },
    })
    expect(outcome.statusCode).toBe(200)
    expect(outcome.headers["cache-control"]).toBe("no-store")
    expect(outcome.json()).toMatchObject({
      status: "recorded",
      evidence_level: "self_reported",
    })

    const agents = await store.agentUsageSummary()
    expect(agents.identified_external_agents).toBe(1)
    expect(agents.successful_external_invocations).toBe(1)

    const risk = await app.inject({
      method: "GET",
      url: "/v1/metrics/risk-evaluations",
    })
    expect(risk.statusCode).toBe(200)
    expect(risk.json()).toMatchObject({
      metric: "privacy_safe_agent_tool_risk_preflight",
      evaluations: 1,
      identified_external_agents: 1,
      decisions: { allow: 1, review: 0, block: 0 },
      reported_outcomes: 1,
      outcome_report_rate: 1,
    })

    const invalidReceipt = await app.inject({
      method: "GET",
      url: "/v1/evaluations/not-a-uuid",
    })
    expect(invalidReceipt.statusCode).toBe(400)

    const openapi = await app.inject({ method: "GET", url: "/openapi.json" })
    expect(openapi.statusCode).toBe(200)
    expect(openapi.json().paths).toMatchObject({
      "/v1/evaluations": { post: expect.any(Object) },
      "/v1/evaluations/{id}": {
        get: expect.any(Object),
      },
      "/v1/evaluations/{id}/outcome": {
        post: expect.any(Object),
      },
      "/v1/metrics/risk-evaluations": { get: expect.any(Object) },
    })
  })
})
