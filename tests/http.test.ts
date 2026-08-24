import { afterEach, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { buildApp, mcpTelemetry } from "../src/http/app.js"
import { loadConfig } from "../src/config.js"
import { ToolRegistry } from "../src/tools/registry.js"
import type { ToolDefinition } from "../src/tools/types.js"
import { JsonValueSchema } from "../src/schemas/agent-page-model.js"
import { z } from "zod"
import { createVerifyWebTool } from "../src/tools/definitions/verify-web.js"
import { SERVICE_VERSION } from "../src/version.js"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"

function collectRefs(node: unknown, refs: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectRefs(child, refs)
    return
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(
      node as Record<string, unknown>
    )) {
      if (key === "$ref" && typeof value === "string") refs.push(value)
      else collectRefs(value, refs)
    }
  }
}

function resolvePointer(doc: unknown, ref: string): boolean {
  if (!ref.startsWith("#/")) return false
  const parts = ref
    .slice(2)
    .split("/")
    .map((p) => p.replaceAll("~1", "/").replaceAll("~0", "~"))
  let current: unknown = doc
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return false
    }
  }
  return current !== undefined
}

const UnderstandOut = z
  .object({
    page_type: z.string(),
    summary: z.string(),
    entities: z.array(z.unknown()),
    state: z.object({
      login_status: z.string(),
      properties: z.record(z.string(), JsonValueSchema),
    }),
    actions: z.array(z.unknown()),
    evidence: z.array(z.unknown()),
    confidence: z.number(),
  })
  .passthrough()

const UnderstandIn = z.object({ url: z.url({ protocol: /^https?$/ }) }).strict()

const VerifyIn = z
  .object({
    url: z.url({ protocol: /^https?$/ }),
    expected_status: z.number().int(),
    expected_text: z.string().optional(),
  })
  .strict()

const VerifyOut = z
  .object({
    verified: z.boolean(),
    checks: z.object({
      reachable: z.boolean(),
      status: z.number().nullable(),
      https_valid: z.boolean(),
      text_found: z.boolean(),
    }),
    checked_at: z.string(),
    error: z.string().optional(),
  })
  .passthrough()

function mockRegistry(): ToolRegistry {
  const understand: ToolDefinition = {
    name: "understand_webpage",
    description: "Understand a webpage",
    use_when: "When you need page semantics",
    do_not_use_when: "When only deployment verification is needed",
    version: "0.1.0",
    endpoint: "/understand",
    method: "POST",
    status: "active",
    read_only: true,
    side_effects: [],
    requires_auth: false,
    cost: "free",
    typical_latency_ms: 100,
    examples: [
      {
        description: "Understand example.com",
        input: { url: "https://example.com" },
        output: {
          page_type: "homepage",
          summary: "Homepage at https://example.com",
          entities: [],
          state: { login_status: "unknown", properties: {} },
          actions: [],
          evidence: [],
          confidence: 0.5,
        },
      },
    ],
    inputSchema: UnderstandIn,
    outputSchema: UnderstandOut,
    handler: async ({ url }) => ({
      page_type: "homepage",
      summary: `Homepage at ${url}`,
      entities: [],
      state: { login_status: "unknown", properties: {} },
      actions: [],
      evidence: [{ source: "url", field: "final_url", raw_value: url }],
      confidence: 0.5,
    }),
  }

  const verify: ToolDefinition = {
    name: "verify_web",
    description: "Verify a website",
    use_when: "After a deploy claim",
    do_not_use_when: "When page semantics are needed",
    version: "0.1.0",
    endpoint: "/verify/web",
    method: "POST",
    status: "active",
    read_only: true,
    side_effects: [],
    requires_auth: false,
    cost: "free",
    typical_latency_ms: 100,
    examples: [
      {
        description: "Verify example.com",
        input: { url: "https://example.com", expected_status: 200 },
        output: {
          verified: true,
          checks: {
            reachable: true,
            status: 200,
            https_valid: true,
            text_found: true,
          },
          checked_at: "2026-08-16T08:50:33.986Z",
        },
      },
    ],
    inputSchema: VerifyIn,
    outputSchema: VerifyOut,
    handler: async ({ expected_status }) => ({
      verified: true,
      checks: {
        reachable: true,
        status: expected_status,
        https_valid: true,
        text_found: true,
      },
      checked_at: new Date().toISOString(),
    }),
  }

  return new ToolRegistry().register(understand).register(verify)
}

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe("HTTP API", () => {
  it("extracts privacy-safe MCP telemetry without logging arguments", () => {
    expect(
      mcpTelemetry(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "verify_web",
            arguments: { url: "https://private.example", secret: "redact" },
          },
        },
        { "mcp-session-id": "opaque-session" }
      )
    ).toEqual({
      mcp_method: "tools/call",
      mcp_tool: "verify_web",
      mcp_session_present: true,
    })

    expect(
      mcpTelemetry({
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          clientInfo: { name: "codex", version: "1.2.3" },
        },
      })
    ).toEqual({
      mcp_method: "initialize",
      mcp_client: "codex",
      mcp_client_version: "1.2.3",
      mcp_protocol_version: "2025-06-18",
      mcp_session_present: false,
    })

    expect(
      mcpTelemetry({
        method: "prompts/get",
        params: {
          name: "research-official-docs",
          arguments: { question: "private prompt content must not be logged" },
        },
      })
    ).toEqual({
      mcp_method: "prompts/get",
      mcp_session_present: false,
    })
  })

  it("serves homepage, health, tools, and OpenAPI", async () => {
    app = await buildApp(mockRegistry(), loadConfig())

    const home = await app.inject({ method: "GET", url: "/" })
    expect(home.statusCode).toBe(200)
    expect(home.body).toContain("404.directory")
    expect(home.body).toContain("understand_webpage")
    expect(home.body).toContain("verify_web")
    expect(home.body).toContain("search_official_docs")
    expect(home.body).toContain("/connect?source=homepage")
    expect(home.body).toContain(
      "npx skills add MM-sheng/404-directory --skill use-404-directory -g -y"
    )
    expect(home.body).toContain("OpenAI")
    expect(home.body).toContain("Microsoft Learn")
    expect(home.body).toContain("AWS")
    expect(home.body).toContain("Cloudflare")

    const favicon = await app.inject({ method: "GET", url: "/favicon.ico" })
    expect(favicon.statusCode).toBe(200)
    expect(favicon.headers["content-type"]).toContain("image/x-icon")
    expect(favicon.rawPayload.length).toBeGreaterThan(1_000)

    const icon = await app.inject({ method: "GET", url: "/icon.svg" })
    expect(icon.statusCode).toBe(200)
    expect(icon.headers["content-type"]).toContain("image/svg+xml")
    expect(icon.body).toContain('aria-label="404 Directory"')
    expect(icon.body).not.toContain("<script")

    const connect = await app.inject({
      method: "GET",
      url: "/connect?source=awesome-remote",
    })
    expect(connect.statusCode).toBe(200)
    expect(connect.headers["content-type"]).toContain("text/html")
    expect(connect.headers["cache-control"]).toBe("no-store")
    expect(connect.body).toContain("Add to Cursor")
    expect(connect.body).toContain("Install in VS Code")
    expect(connect.body).toContain(
      "/connect/install/vscode?source=awesome-remote"
    )
    expect(connect.body).toContain(
      "/connect/install/cursor?source=awesome-remote"
    )
    expect(connect.body).toContain("awesome-remote.codex")
    expect(connect.body).toContain("awesome-remote.claude-code")
    expect(connect.body).toContain("@mmvv1638/404-directory-mcp")
    expect(connect.body).toContain("awesome-remote.npx")
    expect(connect.body).toContain("Complete the first useful call")
    expect(connect.body).toContain("research-official-docs")
    expect(connect.body).toContain("OpenAI Responses API")
    expect(connect.body).toContain("search_official_docs")
    expect(connect.body).toContain("awesome-remote.openai-responses")
    expect(connect.body).toContain("authorization")
    expect(connect.body).toContain("/connect.md?source=awesome-remote")
    expect(connect.body).toContain(
      "https://github.com/MM-sheng/404-directory/issues/1"
    )
    expect(connect.body).not.toContain("agent:REPLACE_WITH")

    const connectMarkdown = await app.inject({
      method: "GET",
      url: "/connect.md?source=agent-reader",
    })
    expect(connectMarkdown.statusCode).toBe(200)
    expect(connectMarkdown.headers["content-type"]).toContain("text/markdown")
    expect(connectMarkdown.headers["cache-control"]).toBe("no-store")
    expect(connectMarkdown.body).toContain("Add 404.directory to Cursor")
    expect(connectMarkdown.body).toContain(
      "/connect/install/cursor?source=agent-reader"
    )
    expect(connectMarkdown.body).toContain("agent-reader.codex")
    expect(connectMarkdown.body).toContain("@mmvv1638/404-directory-mcp")
    expect(connectMarkdown.body).toContain("agent-reader.npx")
    expect(connectMarkdown.body).toContain(
      "Complete one task the user already needs"
    )
    expect(connectMarkdown.body).toContain("verify-public-deployment")
    expect(connectMarkdown.body).toContain("## OpenAI Responses API")
    expect(connectMarkdown.body).toContain('"server_label": "directory_404"')
    expect(connectMarkdown.body).toContain('"name": "search_official_docs"')
    expect(connectMarkdown.body).toContain('"authorization": "agent:')
    expect(connectMarkdown.body).toContain("agent-reader.openai-responses")
    const openAiPayloadMatch = connectMarkdown.body.match(
      /## OpenAI Responses API[\s\S]*?```json\n([\s\S]*?)\n```/
    )
    expect(openAiPayloadMatch?.[1]).toBeTruthy()
    const openAiPayload = JSON.parse(openAiPayloadMatch![1]!) as {
      tools: Array<Record<string, unknown>>
      tool_choice: Record<string, unknown>
    }
    expect(openAiPayload.tools[0]).toMatchObject({
      type: "mcp",
      server_url: "https://404.directory/mcp",
      allowed_tools: ["search_official_docs"],
      require_approval: "never",
    })
    expect(openAiPayload.tools[0]).not.toHaveProperty("headers")
    expect(openAiPayload.tools[0]?.authorization).toMatch(
      /^agent:[0-9a-f-]{36}@agent-reader\.openai-responses$/
    )
    expect(openAiPayload.tool_choice).toEqual({
      type: "mcp",
      server_label: "directory_404",
      name: "search_official_docs",
    })
    expect(connectMarkdown.body).toContain("call `verify_web`")
    expect(connectMarkdown.body).toContain("call `search_tools`")
    expect(connectMarkdown.body).toContain(
      "https://github.com/MM-sheng/404-directory/issues/1"
    )

    const health = await app.inject({ method: "GET", url: "/health" })
    expect(health.statusCode).toBe(200)
    expect(health.json()).toMatchObject({
      status: "ok",
      version: SERVICE_VERSION,
      catalog: false,
      browser_egress: "pinned_ip_proxy",
      tools: expect.arrayContaining(["understand_webpage", "verify_web"]),
    })

    const tools = await app.inject({ method: "GET", url: "/tools" })
    expect(tools.statusCode).toBe(200)
    const catalog = tools.json()
    expect(Object.keys(catalog)).toEqual(["tools"])
    expect(catalog.tools).toHaveLength(2)
    expect(catalog.tools[0]).toMatchObject({
      name: expect.any(String),
      description: expect.any(String),
      use_when: expect.any(String),
      href: expect.stringMatching(/^\/tools\//),
    })
    expect(catalog.tools[0]).not.toHaveProperty("input_schema")

    const one = await app.inject({
      method: "GET",
      url: "/tools/verify_web",
    })
    expect(one.statusCode).toBe(200)
    expect(one.json()).toMatchObject({
      endpoint: "/verify/web",
      do_not_use_when: expect.any(String),
      read_only: true,
      side_effects: [],
      requires_auth: false,
      cost: "free",
      typical_latency_ms: expect.any(Number),
      input_schema: expect.any(Object),
      output_schema: expect.any(Object),
      examples: expect.any(Array),
    })

    const openapi = await app.inject({ method: "GET", url: "/openapi.json" })
    expect(openapi.statusCode).toBe(200)
    const spec = openapi.json()
    const understandOperation = spec.paths["/understand"].post
    expect(understandOperation).toMatchObject({
      operationId: "understand_webpage",
      description: expect.stringContaining("When to use"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: expect.objectContaining({
              type: "object",
            }),
          },
        },
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: expect.objectContaining({
                type: "object",
              }),
            },
          },
        },
        400: expect.any(Object),
        408: expect.any(Object),
        429: expect.any(Object),
        500: expect.any(Object),
      },
    })
    expect(spec.paths["/verify/web"].post.operationId).toBe("verify_web")
    expect(spec.components?.securitySchemes).toEqual({
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "REGISTRY_ADMIN_TOKEN or provider_api_key from POST /v1/tools",
      },
    })

    const docs = await app.inject({ method: "GET", url: "/docs.md" })
    expect(docs.statusCode).toBe(200)
    expect(docs.headers["content-type"]).toContain("text/markdown")
    expect(docs.body).toContain("Do not use when")
    expect(docs.body).toContain("GET /connect.md")
    expect(docs.body).not.toContain(
      "codex mcp add 404-directory --url https://404.directory/mcp"
    )
    expect(docs.body).not.toContain(
      "claude mcp add --transport http --scope user 404-directory https://404.directory/mcp"
    )

    const privacy = await app.inject({ method: "GET", url: "/privacy" })
    expect(privacy.statusCode).toBe(200)
    expect(privacy.body).toContain("does not intentionally persist")

    const terms = await app.inject({ method: "GET", url: "/terms" })
    expect(terms.statusCode).toBe(200)
    expect(terms.body).toContain("public HTTP(S) resources")

    const inactiveOpenAiChallenge = await app.inject({
      method: "GET",
      url: "/.well-known/openai-apps-challenge",
    })
    expect(inactiveOpenAiChallenge.statusCode).toBe(404)

    const llms = await app.inject({ method: "GET", url: "/llms.txt" })
    expect(llms.statusCode).toBe(200)
    expect(llms.headers["content-type"]).toContain("text/markdown")
    expect(llms.body).toContain("[MCP endpoint](https://404.directory/mcp)")
    expect(llms.body).toContain(
      "[verify_web metadata](https://404.directory/tools/verify_web)"
    )
    expect(llms.body).toContain("[Installable Agent Skill]")
    expect(llms.body).toContain("--skill use-404-directory")

    const robots = await app.inject({ method: "GET", url: "/robots.txt" })
    expect(robots.statusCode).toBe(200)
    expect(robots.body).toContain("User-agent: OAI-SearchBot\nAllow: /")
    expect(robots.body).toContain("User-agent: Claude-SearchBot\nAllow: /")
    expect(robots.body).toContain("Sitemap: https://404.directory/sitemap.xml")

    const sitemap = await app.inject({ method: "GET", url: "/sitemap.xml" })
    expect(sitemap.statusCode).toBe(200)
    expect(sitemap.headers["content-type"]).toContain("application/xml")
    expect(sitemap.body).toContain(
      "<loc>https://404.directory/tools/verify_web</loc>"
    )
    expect(sitemap.body).toContain(
      "<loc>https://404.directory/tools/understand_webpage</loc>"
    )

    const indexNowKey = await app.inject({
      method: "GET",
      url: "/81aaad4415a83b2ddecc49c0897c9a74.txt",
    })
    expect(indexNowKey.statusCode).toBe(200)
    expect(indexNowKey.body).toBe("81aaad4415a83b2ddecc49c0897c9a74")

    const mcpInfo = await app.inject({ method: "GET", url: "/mcp-info" })
    expect(mcpInfo.statusCode).toBe(200)
    expect(mcpInfo.json()).toEqual({
      name: "404.directory",
      protocol: "MCP",
      transport: "streamable-http",
      server_url: "https://404.directory/mcp",
      registry_name: "io.github.MM-sheng/404-directory",
      repository: "https://github.com/MM-sheng/404-directory",
      requires_auth: false,
      positioning: "agent-discovery-trust-execution",
      tools: ["understand_webpage", "verify_web"],
      prompts: ["verify-public-deployment"],
      discovery_api: null,
    })

    const serverCard = await app.inject({
      method: "GET",
      url: "/.well-known/mcp/server-card.json",
    })
    expect(serverCard.statusCode).toBe(200)
    expect(serverCard.json()).toMatchObject({
      version: "1.0",
      protocolVersion: "2025-11-25",
      url: "https://404.directory/mcp",
      serverInfo: { name: "404.directory", version: SERVICE_VERSION },
      transport: { type: "streamable-http", endpoint: "/mcp" },
      capabilities: { tools: {}, prompts: {} },
      authentication: { required: false, schemes: [] },
      tools: [
        {
          name: "understand_webpage",
          inputSchema: expect.any(Object),
          outputSchema: expect.any(Object),
        },
        {
          name: "verify_web",
          inputSchema: expect.any(Object),
          outputSchema: expect.any(Object),
        },
      ],
      resources: [],
      prompts: [expect.objectContaining({ name: "verify-public-deployment" })],
    })
    expect(serverCard.headers["access-control-allow-origin"]).toBe("*")

    const integrations = await app.inject({
      method: "GET",
      url: "/.well-known/integrations.json",
    })
    expect(integrations.statusCode).toBe(200)
    expect(integrations.headers["content-type"]).toContain("application/json")
    expect(integrations.headers["access-control-allow-origin"]).toBe("*")
    expect(integrations.json()).toMatchObject({
      version: 3,
      surfaces: [
        {
          slug: "404-directory-mcp",
          type: "mcp",
          url: "https://404.directory/mcp",
          transports: ["streamable-http"],
          auth: { status: "none" },
        },
        {
          slug: "404-directory-rest-api",
          type: "http",
          spec: "https://404.directory/openapi.json",
          auth: { status: "unknown" },
        },
      ],
    })

    const apiCatalog = await app.inject({
      method: "GET",
      url: "/.well-known/api-catalog",
    })
    expect(apiCatalog.statusCode).toBe(200)
    expect(apiCatalog.headers["content-type"]).toContain(
      "application/linkset+json"
    )
    expect(apiCatalog.json()).toMatchObject({
      linkset: [
        {
          anchor: "https://404.directory",
          item: [{ href: "https://404.directory/mcp" }],
          "service-desc": [{ href: "https://404.directory/openapi.json" }],
        },
      ],
    })
  })

  it("serves exactly the configured OpenAI Apps domain challenge token", async () => {
    app = await buildApp(
      mockRegistry(),
      loadConfig({ OPENAI_APPS_CHALLENGE_TOKEN: "openai-domain-token" })
    )

    const response = await app.inject({
      method: "GET",
      url: "/.well-known/openai-apps-challenge",
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers["content-type"]).toContain("text/plain")
    expect(response.headers["cache-control"]).toBe("no-store")
    expect(response.body).toBe("openai-domain-token")
  })

  it("tracks installation intent without exposing the raw Agent ID in the tracking URL", async () => {
    const store = new MemoryCatalogStore()
    app = await buildApp(mockRegistry(), loadConfig(), store)

    const connect = await app.inject({
      method: "GET",
      url: "/connect?source=cursor-marketplace",
    })
    expect(connect.statusCode).toBe(200)
    expect(connect.body).toContain(
      "https://404.directory/connect/install/cursor?source=cursor-marketplace"
    )
    expect(connect.body).not.toMatch(/connect\/install\/cursor[^\"]*agent:/)

    const install = await app.inject({
      method: "GET",
      url: "/connect/install/cursor?source=cursor-marketplace",
    })
    expect(install.statusCode).toBe(302)
    const location = install.headers.location
    expect(location).toMatch(/^cursor:\/\//)
    const configValue = new URL(location!).searchParams.get("config")
    const config = JSON.parse(
      Buffer.from(configValue!, "base64").toString("utf8")
    ) as { url: string; headers: Record<string, string> }
    expect(config).toMatchObject({
      url: "https://404.directory/mcp",
      headers: {
        "X-404-Source": "cursor-marketplace.cursor",
      },
    })
    expect(config.headers["X-404-Agent-ID"]).toMatch(/^agent:[0-9a-f-]{36}$/)

    const funnel = await app.inject({
      method: "GET",
      url: "/v1/metrics/activation",
    })
    expect(funnel.statusCode).toBe(200)
    expect(funnel.json()).toMatchObject({
      metric: "privacy_safe_agent_activation_funnel",
      stages: expect.arrayContaining([
        expect.objectContaining({ stage: "connect_view", events: 1 }),
        expect.objectContaining({ stage: "install_click", events: 1 }),
      ]),
      sources: expect.arrayContaining([
        expect.objectContaining({
          source: "cursor-marketplace",
          connect_views: 1,
        }),
        expect.objectContaining({
          source: "cursor-marketplace.cursor",
          install_clicks: 1,
        }),
      ]),
    })
  })

  it("renders a no-store evidence dashboard without raw identity data", async () => {
    const store = new MemoryCatalogStore()
    app = await buildApp(mockRegistry(), loadConfig(), store)

    const dashboard = await app.inject({ method: "GET", url: "/metrics" })
    expect(dashboard.statusCode).toBe(200)
    expect(dashboard.headers["cache-control"]).toBe("no-store")
    expect(dashboard.body).toContain("Real Agent evidence")
    expect(dashboard.body).toContain("Qualified Agents")
    expect(dashboard.body).toContain("7-day retention")
    expect(dashboard.body).toContain("Tool reliability")
    expect(dashboard.body).not.toContain("X-404-Agent-ID")
  })

  it("serves MCP prompts over HTTP and records only prompt activation stages", async () => {
    const store = new MemoryCatalogStore()
    app = await buildApp(mockRegistry(), loadConfig(), store)
    const headers = {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": "2025-11-25",
      "x-404-agent-id": "agent:http-prompt-user-1234",
      "x-404-source": "prompt-http-test",
      "user-agent": "external-prompt-client/1.0",
    }

    const listed = await app.inject({
      method: "POST",
      url: "/mcp",
      headers,
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "prompts/list",
        params: {},
      },
    })
    expect(listed.statusCode).toBe(200)
    expect(listed.body).toContain("verify-public-deployment")

    const opened = await app.inject({
      method: "POST",
      url: "/mcp",
      headers,
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "prompts/get",
        params: {
          name: "verify-public-deployment",
          arguments: {
            url: "https://example.com/release",
            expected_status: "200",
          },
        },
      },
    })
    expect(opened.statusCode).toBe(200)
    expect(opened.body).toContain("verify_web")

    const activation = await store.activationFunnelSummary()
    expect(activation.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "prompts_list",
          events: 1,
          identified_agents: 1,
        }),
        expect.objectContaining({
          stage: "prompt_get",
          events: 1,
          identified_agents: 1,
        }),
      ])
    )
    expect(activation.sources).toContainEqual(
      expect.objectContaining({
        source: "prompt-http-test",
        prompts_list_events: 1,
        prompts_listed_agents: 1,
        prompt_get_events: 1,
        prompt_get_agents: 1,
        prompt_activated_agents: 0,
        successful_agents: 0,
        prompt_activation_rate: 0,
      })
    )
  })

  it("emits an OpenAPI document with only resolvable $refs", async () => {
    app = await buildApp(mockRegistry(), loadConfig())

    const openapi = await app.inject({ method: "GET", url: "/openapi.json" })
    expect(openapi.statusCode).toBe(200)
    const spec = openapi.json()

    const refs: string[] = []
    collectRefs(spec, refs)

    expect(refs.length).toBeGreaterThan(0)
    expect(spec.components?.schemas?.JsonValue).toBeDefined()

    const unresolved = [...new Set(refs)].filter(
      (ref) => !resolvePointer(spec, ref)
    )
    expect(unresolved).toEqual([])
  })

  it("returns the structured model from POST /understand", async () => {
    app = await buildApp(mockRegistry(), loadConfig())

    const response = await app.inject({
      method: "POST",
      url: "/understand",
      payload: { url: "https://example.com" },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      page_type: "homepage",
      confidence: 0.5,
    })
  })

  it("returns verify results from POST /verify/web", async () => {
    app = await buildApp(mockRegistry(), loadConfig())

    const response = await app.inject({
      method: "POST",
      url: "/verify/web",
      payload: {
        url: "https://example.com",
        expected_status: 200,
        expected_text: "Example",
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      verified: true,
      checks: { status: 200, https_valid: true },
    })
  })

  it("serializes the production verify_web evidence schema", async () => {
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
    app = await buildApp(registry, loadConfig())

    const response = await app.inject({
      method: "POST",
      url: "/verify/web",
      payload: {
        url: "https://example.com",
        expected_status: 200,
        expected_text: "Example Domain",
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().evidence).toMatchObject({
      requested_url: "https://example.com",
      final_url: "https://example.com/",
      http: { status: 200, expected_status: 200, matched: true },
      tls: { requested: true, valid: true },
      redirects: { count: 0, chain: [] },
      claims: expect.arrayContaining([
        expect.objectContaining({ claim: "status_matches", passed: true }),
      ]),
    })
  })

  it("rejects malformed URLs", async () => {
    app = await buildApp(mockRegistry(), loadConfig())

    const response = await app.inject({
      method: "POST",
      url: "/understand",
      payload: { url: "not-a-url" },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: "invalid_request",
      message: expect.any(String),
    })
  })

  it("returns a structured error for malformed JSON", async () => {
    app = await buildApp(mockRegistry(), loadConfig())

    const response = await app.inject({
      method: "POST",
      url: "/verify/web",
      headers: { "content-type": "application/json" },
      payload: '{"url":',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: "invalid_request",
      message: expect.any(String),
    })
  })

  it("rejects unknown REST input properties instead of silently removing them", async () => {
    app = await buildApp(mockRegistry(), loadConfig())

    const response = await app.inject({
      method: "POST",
      url: "/verify/web",
      payload: {
        url: "https://example.com",
        expected_status: 200,
        extra: true,
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: "invalid_request",
      message: expect.stringContaining("additional properties"),
    })
  })

  it("returns the platform error shape for unknown routes", async () => {
    app = await buildApp(mockRegistry(), loadConfig())

    const response = await app.inject({
      method: "GET",
      url: "/does-not-exist",
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      error: "not_found",
      message: "Route not found",
    })
  })

  it("adds security, request-id, timing, and cache headers", async () => {
    app = await buildApp(mockRegistry(), loadConfig())

    const home = await app.inject({ method: "GET", url: "/" })
    expect(home.headers).toMatchObject({
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "x-request-id": expect.any(String),
    })
    expect(home.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'"
    )
    expect(home.headers["server-timing"]).toMatch(/^app;dur=/)
    expect(home.headers["cache-control"]).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400"
    )
    expect(home.headers.link).toContain('</llms.txt>; rel="describedby"')
    expect(home.headers.link).toContain(
      '</docs.md>; rel="alternate"; type="text/markdown"'
    )
    expect(home.headers.link).toContain(
      '</.well-known/integrations.json>; rel="service-meta"'
    )

    const tool = await app.inject({
      method: "POST",
      url: "/verify/web",
      payload: { url: "https://example.com", expected_status: 200 },
    })
    expect(tool.headers["cache-control"]).toBe("no-store")

    const catalog = await app.inject({ method: "GET", url: "/tools" })
    expect(catalog.headers["cache-control"]).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400"
    )

    const health = await app.inject({ method: "GET", url: "/health" })
    expect(health.headers["cache-control"]).toBe("no-store")
  })

  it("applies the expensive-tool quota per client IP", async () => {
    app = await buildApp(
      mockRegistry(),
      loadConfig({
        TOOL_RATE_LIMIT_MAX: "1",
      })
    )

    const invoke = (ip: string) =>
      app!.inject({
        method: "POST",
        url: "/verify/web",
        headers: { "x-vercel-forwarded-for": ip },
        payload: { url: "https://example.com", expected_status: 200 },
      })

    expect((await invoke("203.0.113.1")).statusCode).toBe(200)
    const limited = await invoke("203.0.113.1")
    expect(limited.statusCode, limited.body).toBe(429)
    expect((await invoke("203.0.113.2")).statusCode).toBe(200)
  })

  it("does not expose handler exception details over HTTP", async () => {
    const input = z.object({ value: z.string() }).strict()
    const output = z.object({ ok: z.boolean() }).strict()
    const failing: ToolDefinition<typeof input, typeof output> = {
      name: "failing_tool",
      description:
        "Test tool that always fails so HTTP error sanitization can be verified.",
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
    app = await buildApp(new ToolRegistry().register(failing), loadConfig())

    const response = await app.inject({
      method: "POST",
      url: "/failing",
      payload: { value: "test" },
    })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      error: "tool_failed",
      message: "Tool execution failed",
    })
    expect(response.body).not.toContain("/srv/private")
  })
})
