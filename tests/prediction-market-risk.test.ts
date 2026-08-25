import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import type { FastifyInstance } from "fastify"
import { afterEach, describe, expect, it } from "vitest"
import { loadConfig } from "../src/config.js"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import {
  PredictionMarketInputError,
  evaluatePredictionMarket,
  getPredictionMarketEvaluationReceipt,
  parsePredictionMarketReference,
  reportPredictionMarketOutcome,
  type PredictionMarketDataSource,
} from "../src/domain/prediction-market-risk.js"
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

function clearMarket(overrides: Record<string, unknown> = {}) {
  return {
    id: "101",
    question: "Will Example publish the result before September 2026?",
    slug: "example-result-before-september-2026",
    conditionId: `0x${"a".repeat(64)}`,
    description:
      "This market resolves Yes if Example publishes the result by August 31, 2026, 11:59 PM ET. Otherwise it resolves No.",
    resolutionSource: "https://example.org/official-results",
    endDate: "2026-09-01T03:59:00Z",
    updatedAt: "2026-08-26T00:00:00Z",
    active: true,
    closed: false,
    acceptingOrders: true,
    enableOrderBook: true,
    restricted: false,
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.40","0.60"]',
    clobTokenIds: '["yes-token","no-token"]',
    liquidityNum: 25_000,
    bestBid: 0.39,
    bestAsk: 0.4,
    spread: 0.01,
    ...overrides,
  }
}

function liquidBook(assetId = "yes-token") {
  return {
    market: `0x${"a".repeat(64)}`,
    asset_id: assetId,
    timestamp: String(new Date("2026-08-26T00:00:01Z").getTime()),
    bids: [
      { price: "0.39", size: "1000" },
      { price: "0.38", size: "1000" },
    ],
    asks: [
      { price: "0.40", size: "1000" },
      { price: "0.41", size: "1000" },
    ],
  }
}

class FakePredictionMarketDataSource implements PredictionMarketDataSource {
  constructor(
    private readonly market: unknown = clearMarket(),
    private readonly books: Record<string, unknown> = {
      "yes-token": liquidBook("yes-token"),
      "no-token": liquidBook("no-token"),
    }
  ) {}

  async getMarket(): Promise<unknown> {
    return structuredClone(this.market)
  }

  async getOrderBook(tokenId: string): Promise<unknown> {
    const book = this.books[tokenId]
    if (!book) throw new Error("missing test book")
    return structuredClone(book)
  }
}

describe("prediction-market risk preflight", () => {
  it("accepts only exact Polymarket references", () => {
    expect(
      parsePredictionMarketReference(
        "https://polymarket.com/event/example-event/example-result-before-september-2026"
      )
    ).toEqual({
      kind: "slug",
      value: "example-result-before-september-2026",
    })
    expect(parsePredictionMarketReference("101")).toEqual({
      kind: "id",
      value: "101",
    })
    expect(() =>
      parsePredictionMarketReference("https://evil.example/event/market")
    ).toThrow(PredictionMarketInputError)
  })

  it("allows a clear, eligible, supervised decision with adequate depth", async () => {
    const store = new MemoryCatalogStore()
    const evaluation = await evaluatePredictionMarket(
      store,
      {
        market: "example-result-before-september-2026",
        intended_action: "buy_yes",
        estimated_notional_usd: 100,
        execution_mode: "supervised",
        geographic_eligibility: "eligible",
      },
      new FakePredictionMarketDataSource()
    )

    expect(evaluation).toMatchObject({
      platform: "polymarket",
      decision: "allow",
      risk_score: 0,
      policy_version: "polymarket-preflight-v1",
      reason_codes: ["PREFLIGHT_PASSED"],
      market: {
        id: "101",
        slug: "example-result-before-september-2026",
      },
      outcome_reporting: {
        mcp_tool: "report_prediction_market_outcome",
      },
    })
    expect(evaluation.depth?.coverage_ratio).toBeGreaterThan(1)
    expect(evaluation.outcome_token.length).toBeGreaterThanOrEqual(32)

    const receipt = await getPredictionMarketEvaluationReceipt(
      store,
      evaluation.receipt_id
    )
    expect(receipt).not.toHaveProperty("outcome_token")
    expect(receipt).not.toHaveProperty("outcome_token_hash")
    expect(JSON.stringify(receipt)).not.toContain(evaluation.outcome_token)
  })

  it("reviews subjective settlement rules and blocks unavailable markets", async () => {
    const store = new MemoryCatalogStore()
    const ambiguous = await evaluatePredictionMarket(
      store,
      {
        market: "ambiguous-market",
        intended_action: "observe",
        execution_mode: "supervised",
        geographic_eligibility: "unknown",
      },
      new FakePredictionMarketDataSource(
        clearMarket({
          id: "102",
          slug: "ambiguous-market",
          resolutionSource: "",
          description:
            "This resolves Yes if there is a significant change, based on a consensus of credible reporting.",
        })
      )
    )
    expect(ambiguous.decision).toBe("review")
    expect(ambiguous.reason_codes).toEqual(
      expect.arrayContaining([
        "RESOLUTION_SOURCE_GENERIC",
        "TIME_BOUNDARY_UNCLEAR",
        "SUBJECTIVE_RULE_LANGUAGE",
      ])
    )

    const closed = await evaluatePredictionMarket(
      store,
      {
        market: "closed-market",
        intended_action: "buy_yes",
        estimated_notional_usd: 100,
        execution_mode: "supervised",
        geographic_eligibility: "eligible",
      },
      new FakePredictionMarketDataSource(
        clearMarket({
          id: "103",
          slug: "closed-market",
          active: false,
          closed: true,
          acceptingOrders: false,
        })
      )
    )
    expect(closed.decision).toBe("block")
    expect(closed.reason_codes).toContain("MARKET_NOT_TRADEABLE")
  })

  it("records one bounded behavior outcome and aggregates data value metrics", async () => {
    const store = new MemoryCatalogStore()
    const evaluation = await evaluatePredictionMarket(
      store,
      {
        market: "example-result-before-september-2026",
        intended_action: "buy_yes",
        estimated_notional_usd: 100,
        execution_mode: "supervised",
        geographic_eligibility: "eligible",
      },
      new FakePredictionMarketDataSource()
    )
    const first = await reportPredictionMarketOutcome(
      store,
      evaluation.receipt_id,
      {
        outcome_token: evaluation.outcome_token,
        action_taken: "reduced_position",
        execution_result: "executed",
      }
    )
    const replay = await reportPredictionMarketOutcome(
      store,
      evaluation.receipt_id,
      {
        outcome_token: evaluation.outcome_token,
        action_taken: "reduced_position",
        execution_result: "executed",
      }
    )
    expect(first).toBe("recorded")
    expect(replay).toBe("already_reported")
    expect(await store.predictionMarketEvaluationSummary()).toMatchObject({
      metric: "privacy_safe_prediction_market_preflight",
      evaluations: 1,
      reported_outcomes: 1,
      behavior_changes: 1,
      behavior_change_rate: 1,
    })
  })

  it("exposes the preflight and feedback loop through MCP", async () => {
    const store = new MemoryCatalogStore()
    const server = createMcpServerFromRegistry(
      new ToolRegistry(),
      store,
      null,
      new FakePredictionMarketDataSource()
    )
    const client = new Client({ name: "prediction-test", version: "1.0.0" })
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ])
    clients.push(client)

    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "evaluate_prediction_market",
        "report_prediction_market_outcome",
      ])
    )
    const result = await client.callTool({
      name: "evaluate_prediction_market",
      arguments: {
        market: "example-result-before-september-2026",
        intended_action: "buy_yes",
        estimated_notional_usd: 100,
        geographic_eligibility: "eligible",
      },
    })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({ decision: "allow" })
    const created = result.structuredContent as {
      receipt_id: string
      outcome_token: string
    }
    const reported = await client.callTool({
      name: "report_prediction_market_outcome",
      arguments: {
        receipt_id: created.receipt_id,
        outcome_token: created.outcome_token,
        action_taken: "proceeded",
        execution_result: "executed",
      },
    })
    expect(reported.structuredContent).toMatchObject({ status: "recorded" })
  })

  it("exposes REST receipts, outcome reporting, metrics, and OpenAPI", async () => {
    const store = new MemoryCatalogStore()
    app = await buildApp(
      new ToolRegistry(),
      loadConfig({
        REGISTRY_REQUIRE_AUTH: "true",
        REGISTRY_ADMIN_TOKEN: "test-admin-token-16chars",
        AGENT_ANALYTICS_SALT: "test-agent-analytics-salt-123",
      }),
      store,
      { predictionMarketDataSource: new FakePredictionMarketDataSource() }
    )
    const created = await app.inject({
      method: "POST",
      url: "/v1/prediction-markets/evaluations",
      headers: {
        "x-404-agent-id": "agent:prediction-preflight-test-0001",
        "x-404-client-name": "external-prediction-test",
        "x-404-source": "prediction-test",
      },
      payload: {
        market: "example-result-before-september-2026",
        intended_action: "buy_yes",
        estimated_notional_usd: 100,
        geographic_eligibility: "eligible",
      },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ decision: "allow" })

    const receipt = await app.inject({
      method: "GET",
      url: `/v1/prediction-markets/evaluations/${created.json().receipt_id}`,
    })
    expect(receipt.statusCode).toBe(200)
    expect(receipt.json()).not.toHaveProperty("outcome_token")

    const outcome = await app.inject({
      method: "POST",
      url: `/v1/prediction-markets/evaluations/${created.json().receipt_id}/outcome`,
      payload: {
        outcome_token: created.json().outcome_token,
        action_taken: "waited",
        execution_result: "not_executed",
      },
    })
    expect(outcome.statusCode).toBe(200)
    expect(outcome.json()).toMatchObject({ status: "recorded" })

    const metrics = await app.inject({
      method: "GET",
      url: "/v1/metrics/prediction-market-evaluations",
    })
    expect(metrics.statusCode).toBe(200)
    expect(metrics.json()).toMatchObject({
      evaluations: 1,
      identified_external_agents: 1,
      behavior_changes: 1,
    })

    const openapi = await app.inject({ method: "GET", url: "/openapi.json" })
    expect(openapi.statusCode).toBe(200)
    expect(openapi.json().paths).toMatchObject({
      "/v1/prediction-markets/evaluations": { post: expect.any(Object) },
      "/v1/prediction-markets/evaluations/{id}": {
        get: expect.any(Object),
      },
      "/v1/prediction-markets/evaluations/{id}/outcome": {
        post: expect.any(Object),
      },
      "/v1/metrics/prediction-market-evaluations": {
        get: expect.any(Object),
      },
    })

    const serverCard = await app.inject({
      method: "GET",
      url: "/.well-known/mcp/server-card.json",
    })
    expect(serverCard.statusCode).toBe(200)
    const marketTool = serverCard
      .json()
      .tools.find(
        (tool: { name: string }) => tool.name === "evaluate_prediction_market"
      )
    expect(marketTool).toMatchObject({
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    })
  })
})
