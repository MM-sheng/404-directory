import { afterEach, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { buildApp } from "../src/http/app.js"
import { loadConfig } from "../src/config.js"
import { ToolRegistry } from "../src/tools/registry.js"
import type { ToolDefinition } from "../src/tools/types.js"
import { JsonValueSchema } from "../src/schemas/agent-page-model.js"
import { z } from "zod"
import { createVerifyWebTool } from "../src/tools/definitions/verify-web.js"

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
    version: "0.1.0",
    endpoint: "/understand",
    method: "POST",
    status: "active",
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
    version: "0.1.0",
    endpoint: "/verify/web",
    method: "POST",
    status: "active",
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
  it("serves homepage, health, tools, and OpenAPI", async () => {
    app = await buildApp(mockRegistry(), loadConfig())

    const home = await app.inject({ method: "GET", url: "/" })
    expect(home.statusCode).toBe(200)
    expect(home.body).toContain("404.directory")
    expect(home.body).toContain("understand_webpage")
    expect(home.body).toContain("verify_web")

    const health = await app.inject({ method: "GET", url: "/health" })
    expect(health.statusCode).toBe(200)
    expect(health.json()).toMatchObject({
      status: "ok",
      version: "0.3.0",
      browser_egress: "pinned_ip_proxy",
      tools: expect.arrayContaining(["understand_webpage", "verify_web"]),
    })

    const tools = await app.inject({ method: "GET", url: "/tools" })
    expect(tools.statusCode).toBe(200)
    const catalog = tools.json()
    expect(catalog.authentication).toEqual({ required: false })
    expect(catalog.tools).toHaveLength(2)
    expect(catalog.tools[0]).toMatchObject({
      name: expect.any(String),
      description: expect.any(String),
      use_when: expect.any(String),
      version: expect.any(String),
      endpoint: expect.any(String),
      status: "active",
      examples: expect.arrayContaining([
        expect.objectContaining({
          description: expect.any(String),
          input: expect.any(Object),
          output: expect.any(Object),
        }),
      ]),
      input_schema: expect.any(Object),
      output_schema: expect.any(Object),
    })

    const one = await app.inject({
      method: "GET",
      url: "/tools/verify_web",
    })
    expect(one.statusCode).toBe(200)
    expect(one.json().endpoint).toBe("/verify/web")

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
    expect(spec.components.securitySchemes).toMatchObject({
      ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
      BearerAuth: { type: "http", scheme: "bearer" },
    })
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
    expect(response.json().evidence).toHaveLength(4)
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

    const tool = await app.inject({
      method: "POST",
      url: "/verify/web",
      payload: { url: "https://example.com", expected_status: 200 },
    })
    expect(tool.headers["cache-control"]).toBe("no-store")
  })

  it("keeps discovery public and protects execution when API keys exist", async () => {
    const key = "test-api-key-with-at-least-24-characters"
    app = await buildApp(mockRegistry(), loadConfig({ API_KEYS: key }))

    const tools = await app.inject({ method: "GET", url: "/tools" })
    expect(tools.statusCode).toBe(200)
    expect(tools.json().authentication).toMatchObject({ required: true })

    const unauthorized = await app.inject({
      method: "POST",
      url: "/verify/web",
      payload: { url: "https://example.com", expected_status: 200 },
    })
    expect(unauthorized.statusCode).toBe(401)
    expect(unauthorized.json()).toEqual({
      error: "unauthorized",
      message: "A valid API key is required for tool execution.",
    })

    const apiKey = await app.inject({
      method: "POST",
      url: "/verify/web",
      headers: { "x-api-key": key },
      payload: { url: "https://example.com", expected_status: 200 },
    })
    expect(apiKey.statusCode).toBe(200)

    const bearer = await app.inject({
      method: "POST",
      url: "/understand",
      headers: { authorization: `Bearer ${key}` },
      payload: { url: "https://example.com" },
    })
    expect(bearer.statusCode).toBe(200)

    const openapi = await app.inject({ method: "GET", url: "/openapi.json" })
    expect(openapi.json().paths["/verify/web"].post.security).toEqual([
      { ApiKeyAuth: [] },
      { BearerAuth: [] },
    ])
  })

  it("applies the expensive-tool quota per valid API key", async () => {
    const firstKey = "first-test-key-with-at-least-24-characters"
    const secondKey = "second-test-key-with-at-least-24-characters"
    app = await buildApp(
      mockRegistry(),
      loadConfig({
        API_KEYS: `${firstKey},${secondKey}`,
        TOOL_RATE_LIMIT_MAX: "1",
      })
    )

    const invoke = (key: string) =>
      app!.inject({
        method: "POST",
        url: "/verify/web",
        headers: { "x-api-key": key },
        payload: { url: "https://example.com", expected_status: 200 },
      })

    expect((await invoke(firstKey)).statusCode).toBe(200)
    const limited = await invoke(firstKey)
    expect(limited.statusCode, limited.body).toBe(429)
    expect((await invoke(secondKey)).statusCode).toBe(200)
  })

  it("does not expose handler exception details over HTTP", async () => {
    const input = z.object({ value: z.string() }).strict()
    const output = z.object({ ok: z.boolean() }).strict()
    const failing: ToolDefinition<typeof input, typeof output> = {
      name: "failing_tool",
      description:
        "Test tool that always fails so HTTP error sanitization can be verified.",
      use_when: "Only in automated tests.",
      version: "1.0.0",
      endpoint: "/failing",
      method: "POST",
      status: "active",
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
