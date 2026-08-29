import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import type { PredictionMarketDataSource } from "../src/domain/prediction-market-risk.js"
import { createMcpServerFromRegistry } from "../src/mcp/create-server.js"
import type { RemoteMcpGateway } from "../src/mcp/remote-gateway.js"
import { createVerifyWebTool } from "../src/tools/definitions/verify-web.js"
import { ToolRegistry } from "../src/tools/registry.js"
import type { ToolDefinition } from "../src/tools/types.js"

const clients: Client[] = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

async function connect(
  registry: ToolRegistry,
  catalog?: MemoryCatalogStore,
  gateway?: RemoteMcpGateway,
  predictionMarketDataSource?: PredictionMarketDataSource
): Promise<Client> {
  const server = createMcpServerFromRegistry(
    registry,
    catalog,
    gateway,
    predictionMarketDataSource
  )
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
      title: "404.directory — Agent Action Risk Preflight",
      description: expect.stringContaining("allow, review, or block"),
      websiteUrl: "https://404.directory",
    })

    const instructions = client.getInstructions()
    expect(instructions).toContain("Do not call verify_web merely")

    const tools = await client.listTools()
    const verify = tools.tools.find((tool) => tool.name === "verify_web")
    expect(verify?.description).toContain(
      "Do not call this merely before or alongside understand_webpage"
    )
    expect(
      (await client.listPrompts()).prompts.map((prompt) => prompt.name)
    ).toEqual(["verify-public-deployment"])
  })

  it("exposes task-oriented prompts that require real tool execution", async () => {
    const registry = new ToolRegistry().register(
      createVerifyWebTool({
        timeoutMs: 2_000,
        maxBodyBytes: 1_024,
        maxRedirects: 2,
      })
    )
    const gateway: RemoteMcpGateway = {
      inspect: async () => [],
      invoke: async () => ({
        is_error: false,
        content: [],
        truncated: false,
      }),
    }
    const catalog = new MemoryCatalogStore()
    const client = await connect(registry, catalog, gateway)

    const prompts = await client.listPrompts()
    expect(prompts.prompts.map((prompt) => prompt.name)).toEqual([
      "preflight-prediction-market",
      "research-official-docs",
      "verify-public-deployment",
      "evaluate-agent-tool",
    ])
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "verify_web",
        "search_official_docs",
        "search_tools",
        "get_tool",
        "get_trust_score",
      ])
    )

    const marketPreflight = await client.getPrompt({
      name: "preflight-prediction-market",
      arguments: {
        market: "example-market",
        intended_action: "buy_yes",
        estimated_notional_usd: "100",
        execution_mode: "supervised",
        geographic_eligibility: "eligible",
      },
    })
    expect(JSON.stringify(marketPreflight.messages)).toContain(
      "evaluate_prediction_market"
    )
    const marketPreflightText =
      marketPreflight.messages[0]?.content.type === "text"
        ? marketPreflight.messages[0].content.text
        : ""
    expect(marketPreflightText).toContain('"estimated_notional_usd":100')
    expect(JSON.stringify(marketPreflight.messages)).toContain(
      "report_prediction_market_outcome"
    )

    const research = await client.getPrompt({
      name: "research-official-docs",
      arguments: {
        question: "How do remote MCP tools work?",
        provider: "openai",
      },
    })
    const researchText =
      research.messages[0]?.content.type === "text"
        ? research.messages[0].content.text
        : ""
    expect(researchText).toContain("search_official_docs")
    expect(researchText).toContain('"sources":["openai"]')
    expect(researchText).toContain("not task completion")

    const verification = await client.getPrompt({
      name: "verify-public-deployment",
      arguments: {
        url: "https://example.com/release",
        expected_status: "200",
        expected_text: "release-2026-08-24",
      },
    })
    expect(JSON.stringify(verification.messages)).toContain("verify_web")
    expect(JSON.stringify(verification.messages)).toContain(
      "release-2026-08-24"
    )

    const evaluation = await client.getPrompt({
      name: "evaluate-agent-tool",
      arguments: {
        capability: "official documentation search",
        permissions: "public_network",
      },
    })
    expect(JSON.stringify(evaluation.messages)).toContain("search_tools")
    expect(JSON.stringify(evaluation.messages)).toContain("evaluate_tool_risk")
    expect(JSON.stringify(evaluation.messages)).toContain("public_network")
    expect(JSON.stringify(evaluation.messages)).toContain("report_tool_outcome")
    expect((await catalog.agentUsageSummary()).identified_external_agents).toBe(
      0
    )
  })

  it("completes a real local prediction-market MCP preflight without trading", async () => {
    const now = new Date().toISOString()
    const dataSource: PredictionMarketDataSource = {
      getMarket: async () => ({
        id: "skill-contract-market",
        question: "Will the public fixture publish before September 2026?",
        slug: "public-fixture-before-september-2026",
        conditionId: `0x${"a".repeat(64)}`,
        description:
          "Resolves Yes if the public fixture publishes by August 31, 2026 at 23:59 UTC; otherwise No.",
        resolutionSource: "https://example.com/public-result",
        endDate: "2026-09-01T00:00:00Z",
        updatedAt: now,
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
      }),
      getOrderBook: async () => {
        throw new Error("observe must not fetch an order book")
      },
    }
    const store = new MemoryCatalogStore()
    const client = await connect(
      new ToolRegistry(),
      store,
      undefined,
      dataSource
    )

    const result = await client.callTool({
      name: "evaluate_prediction_market",
      arguments: {
        market: "public-fixture-before-september-2026",
        intended_action: "observe",
        execution_mode: "supervised",
        geographic_eligibility: "unknown",
      },
    })

    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      market: { slug: "public-fixture-before-september-2026" },
      intent: {
        intended_action: "observe",
        execution_mode: "supervised",
        geographic_eligibility: "unknown",
      },
      decision: expect.stringMatching(/^(allow|review|block)$/),
      receipt_id: expect.any(String),
      outcome_token: expect.any(String),
    })
    expect(JSON.stringify(result.structuredContent)).not.toContain(
      "recommended_side"
    )
    expect((await store.agentUsageSummary()).identified_external_agents).toBe(0)
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
