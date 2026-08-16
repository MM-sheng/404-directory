import { createHash, randomUUID } from "node:crypto"
import { performance } from "node:perf_hooks"
import rateLimit from "@fastify/rate-limit"
import swagger from "@fastify/swagger"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifySchema,
} from "fastify"
import { z, ZodError } from "zod"
import type { AppConfig } from "../config.js"
import { createMcpServerFromRegistry } from "../mcp/create-server.js"
import { UnsafeUrlError } from "../security/url.js"
import {
  jsonValueComponentSchema,
  zodToJsonSchema,
} from "../tools/json-schema.js"
import type { ToolRegistry } from "../tools/registry.js"
import type { ToolDefinition } from "../tools/types.js"
import {
  renderDocs,
  renderHomepage,
  renderPrivacy,
  renderTerms,
} from "./homepage.js"
import { SERVICE_VERSION } from "../version.js"

const ErrorSchema = z
  .object({
    error: z.string(),
    message: z.string(),
  })
  .strict()

function toolRouteSchema(tool: ToolDefinition): FastifySchema {
  return {
    operationId: tool.name,
    summary: tool.mcp?.title ?? tool.name,
    description: `${tool.description}\n\nWhen to use: ${tool.use_when}\n\nDo not use when: ${tool.do_not_use_when}`,
    tags: ["tools"],
    body: {
      ...zodToJsonSchema(tool.inputSchema),
      examples: tool.examples.map((example) => example.input),
    },
    response: {
      200: {
        ...zodToJsonSchema(tool.outputSchema),
        examples: tool.examples.map((example) => example.output),
      },
      400: zodToJsonSchema(ErrorSchema),
      408: zodToJsonSchema(ErrorSchema),
      429: zodToJsonSchema(ErrorSchema),
      500: zodToJsonSchema(ErrorSchema),
    },
  } as FastifySchema
}

function clientRateLimitKey(request: FastifyRequest): string {
  const forwarded = request.headers["x-vercel-forwarded-for"]
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const source = (header?.split(",")[0]?.trim() || request.ip).slice(0, 200)
  return `ip:${createHash("sha256").update(source).digest("hex").slice(0, 16)}`
}

async function invokeTool(
  tool: ToolDefinition,
  body: unknown,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<unknown> {
  try {
    const input = tool.inputSchema.parse(body)
    const output = await tool.handler(input)
    return tool.outputSchema.parse(output)
  } catch (error) {
    if (error instanceof ZodError || error instanceof UnsafeUrlError) {
      return reply.status(400).send({
        error: "invalid_request",
        message:
          error instanceof ZodError ? z.prettifyError(error) : error.message,
      })
    }
    if (error instanceof Error && /exceeded|timeout/i.test(error.message)) {
      return reply
        .status(408)
        .send({ error: "timeout", message: error.message })
    }
    request.log.error({ err: error, tool: tool.name }, "Tool execution failed")
    return reply.status(500).send({
      error: "tool_failed",
      message: "Tool execution failed",
    })
  }
}

async function handleMcpRequest(
  registry: ToolRegistry,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const server = createMcpServerFromRegistry(registry)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  reply.raw.setHeader("cache-control", "no-store")
  reply.raw.setHeader("x-request-id", request.id)
  reply.raw.setHeader("x-content-type-options", "nosniff")
  reply.raw.setHeader("x-frame-options", "DENY")
  reply.raw.setHeader("referrer-policy", "no-referrer")
  reply.hijack()
  try {
    await server.connect(transport)
    await transport.handleRequest(request.raw, reply.raw, request.body)
  } catch (error) {
    request.log.error({ err: error }, "MCP request failed")
    if (!reply.raw.headersSent) {
      reply.raw.statusCode = 500
      reply.raw.setHeader("content-type", "application/json")
      reply.raw.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        })
      )
    }
  } finally {
    await transport.close().catch(() => undefined)
    await server.close().catch(() => undefined)
  }
}

export async function buildApp(
  registry: ToolRegistry,
  config: AppConfig
): Promise<FastifyInstance> {
  const requestStartedAt = new WeakMap<FastifyRequest, number>()

  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: 32 * 1024,
    requestTimeout: 60_000,
    genReqId: () => randomUUID(),
  })

  app.setErrorHandler((error, request, reply) => {
    const httpError = error as {
      validation?: unknown
      code?: string
      statusCode?: number
      message?: string
    }
    if (
      httpError.validation ||
      httpError.code === "FST_ERR_CTP_INVALID_JSON_BODY"
    ) {
      return reply.status(400).send({
        error: "invalid_request",
        message: httpError.message ?? "Invalid request",
      })
    }
    if (httpError.statusCode === 429) {
      return reply.status(429).send({
        error: "rate_limited",
        message: "Too many requests. Retry later.",
      })
    }
    request.log.error({ err: error }, "Unhandled HTTP error")
    return reply.status(500).send({
      error: "internal_error",
      message: "Unexpected server error",
    })
  })

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({
      error: "not_found",
      message: "Route not found",
    })
  )

  app.addHook("onRequest", async (request) => {
    requestStartedAt.set(request, performance.now())
  })

  app.addHook("onSend", async (request, reply, payload) => {
    const startedAt = requestStartedAt.get(request)
    const durationMs = startedAt
      ? Math.max(0, performance.now() - startedAt)
      : 0
    const path = request.url.split("?", 1)[0] ?? request.url

    reply
      .header("x-request-id", request.id)
      .header("server-timing", `app;dur=${durationMs.toFixed(1)}`)
      .header("x-content-type-options", "nosniff")
      .header("x-frame-options", "DENY")
      .header("referrer-policy", "no-referrer")
      .header("permissions-policy", "camera=(), microphone=(), geolocation=()")
      .header(
        "content-security-policy",
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
      )

    if (request.method !== "GET" || path === "/mcp") {
      reply.header("cache-control", "no-store")
    }

    return payload
  })

  app.addHook("onResponse", async (request, reply) => {
    const path = request.url.split("?", 1)[0] ?? request.url
    const tool = registry
      .listActive()
      .find(
        (entry) =>
          entry.endpoint === path &&
          entry.method === request.method.toUpperCase()
      )?.name
    if (tool || path === "/mcp" || reply.statusCode >= 400) {
      request.log.info(
        {
          route: path,
          method: request.method,
          status_code: reply.statusCode,
          duration_ms: Number(reply.elapsedTime.toFixed(1)),
          tool: tool ?? (path === "/mcp" ? "mcp" : undefined),
          access: "public",
        },
        "Request completed"
      )
    }
  })

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    keyGenerator: clientRateLimitKey,
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: "rate_limited",
      message: "Too many requests. Retry later.",
    }),
  })

  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "404.directory",
        description:
          "Tools built for AI agents. Discover capabilities via GET /tools, call them over REST or MCP.",
        version: SERVICE_VERSION,
      },
      servers: [{ url: config.PUBLIC_BASE_URL }],
      tags: [{ name: "tools", description: "Registered agent tools" }],
    },
    refResolver: {
      // Preserve human/agent-readable component names (default is "def-N").
      buildLocalReference: (json) =>
        (json.$id as string | undefined) ?? "shared",
    },
  })

  // Register the recursive JSON value schema once so `$ref` targets resolve in
  // both ajv validation and the generated OpenAPI document (components.schemas).
  app.addSchema(jsonValueComponentSchema())

  app.get(
    "/",
    { schema: { hide: true } as FastifySchema },
    async (_request, reply) =>
      reply
        .type("text/html; charset=utf-8")
        .send(renderHomepage(registry.discovery()))
  )

  for (const path of ["/docs", "/docs.md"]) {
    app.get(
      path,
      { schema: { hide: true } as FastifySchema },
      async (_request, reply) =>
        reply
          .type("text/markdown; charset=utf-8")
          .send(renderDocs(registry.catalog()))
    )
  }

  app.get(
    "/privacy",
    { schema: { hide: true } as FastifySchema },
    async (_request, reply) =>
      reply.type("text/markdown; charset=utf-8").send(renderPrivacy())
  )

  app.get(
    "/terms",
    { schema: { hide: true } as FastifySchema },
    async (_request, reply) =>
      reply.type("text/markdown; charset=utf-8").send(renderTerms())
  )

  app.get(
    "/health",
    {
      schema: {
        summary: "Service health check",
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["status", "version", "tools", "browser_egress"],
            properties: {
              status: { type: "string", enum: ["ok"] },
              version: { type: "string" },
              browser_egress: {
                type: "string",
                enum: ["pinned_ip_proxy"],
              },
              tools: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
      },
    },
    async () => ({
      status: "ok",
      version: SERVICE_VERSION,
      browser_egress: "pinned_ip_proxy",
      tools: registry.listActive().map((tool) => tool.name),
    })
  )

  app.get(
    "/tools",
    {
      schema: {
        summary: "List registered tools",
        description:
          "Compact low-token tool discovery. Follow href for full metadata and schemas.",
      },
    },
    async () => ({ tools: registry.discovery() })
  )

  app.get(
    "/tools/:name",
    {
      schema: {
        summary: "Get one registered tool",
        params: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      const { name } = request.params as { name: string }
      const entry = registry.catalogEntry(name)
      if (!entry) {
        return reply.status(404).send({
          error: "not_found",
          message: `Unknown tool: ${name}`,
        })
      }
      return entry
    }
  )

  app.get(
    "/openapi.json",
    { schema: { hide: true } as FastifySchema },
    async (_request, reply) =>
      reply.type("application/json").send(app.swagger())
  )

  app.get(
    "/mcp-info",
    { schema: { hide: true } as FastifySchema },
    async () => ({
      name: "404.directory",
      protocol: "MCP",
      transport: "streamable-http",
      server_url: `${config.PUBLIC_BASE_URL}/mcp`,
      requires_auth: false,
      tools: registry.listActive().map((tool) => tool.name),
    })
  )

  app.get(
    "/llms.txt",
    { schema: { hide: true } as FastifySchema },
    async (_request, reply) =>
      reply.type("text/plain; charset=utf-8").send(`# 404.directory
Tools built for AI agents.
Tools: ${config.PUBLIC_BASE_URL}/tools
Tool metadata: ${config.PUBLIC_BASE_URL}/tools/{name}
MCP info: ${config.PUBLIC_BASE_URL}/mcp-info
MCP endpoint: ${config.PUBLIC_BASE_URL}/mcp
OpenAPI: ${config.PUBLIC_BASE_URL}/openapi.json
Docs: ${config.PUBLIC_BASE_URL}/docs.md
Health: ${config.PUBLIC_BASE_URL}/health
`)
  )

  for (const tool of registry.listActive()) {
    if (tool.method === "POST") {
      app.post(
        tool.endpoint,
        {
          schema: toolRouteSchema(tool),
          config: {
            rateLimit: {
              max: config.TOOL_RATE_LIMIT_MAX,
              timeWindow: config.RATE_LIMIT_WINDOW_MS,
            },
          },
        },
        async (request, reply) => invokeTool(tool, request.body, request, reply)
      )
    } else {
      app.get(
        tool.endpoint,
        {
          schema: toolRouteSchema(tool),
          config: {
            rateLimit: {
              max: config.TOOL_RATE_LIMIT_MAX,
              timeWindow: config.RATE_LIMIT_WINDOW_MS,
            },
          },
        },
        async (request, reply) =>
          invokeTool(tool, request.query, request, reply)
      )
    }
  }

  app.route({
    method: ["GET", "POST", "DELETE"],
    url: "/mcp",
    schema: { hide: true } as FastifySchema,
    config: {
      rateLimit: {
        max: config.TOOL_RATE_LIMIT_MAX,
        timeWindow: config.RATE_LIMIT_WINDOW_MS,
      },
    },
    handler: async (request, reply) =>
      handleMcpRequest(registry, request, reply),
  })

  await app.ready()
  return app
}
