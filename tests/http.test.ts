import { afterEach, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { buildApp } from "../src/http/app.js"
import { loadConfig } from "../src/config.js"
import { ToolRegistry } from "../src/tools/registry.js"
import type { ToolDefinition } from "../src/tools/types.js"
import { z } from "zod"

const UnderstandOut = z
  .object({
    page_type: z.string(),
    summary: z.string(),
    entities: z.array(z.unknown()),
    state: z.object({
      login_status: z.string(),
      properties: z.record(z.string(), z.unknown()),
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
    handler: async ({ url, expected_status }) => ({
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
      tools: expect.arrayContaining(["understand_webpage", "verify_web"]),
    })

    const tools = await app.inject({ method: "GET", url: "/tools" })
    expect(tools.statusCode).toBe(200)
    const catalog = tools.json()
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
})
