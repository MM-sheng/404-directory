import { randomUUID } from "node:crypto"
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
import { ApiKeyAuthenticator } from "../security/api-key.js"
import {
  jsonValueComponentSchema,
  zodToJsonSchema,
} from "../tools/json-schema.js"
import type { ToolRegistry } from "../tools/registry.js"
import type { ToolDefinition } from "../tools/types.js"
import { renderDocs, renderHomepage } from "./homepage.js"
import { SERVICE_VERSION } from "../version.js"

const ErrorSchema = z
  .object({
    error: z.string(),
    message: z.string(),
  })
  .strict()

function toolRouteSchema(
  tool: ToolDefinition,
  authRequired: boolean
): FastifySchema {
  return {
    operationId: tool.name,
    summary: tool.mcp?.title ?? tool.name,
    description: `${tool.description}\n\nWhen to use: ${tool.use_when}`,
    tags: ["tools"],
    ...(authRequired
      ? { security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }] }
      : {}),
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
      401: zodToJsonSchema(ErrorSchema),
      408: zodToJsonSchema(ErrorSchema),
      429: zodToJsonSchema(ErrorSchema),
      500: zodToJsonSchema(ErrorSchema),
    },
  } as FastifySchema
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
  const auth = new ApiKeyAuthenticator(config.API_KEYS)
  const protectedRoutes = new Set(
    registry.listActive().map((tool) => `${tool.method} ${tool.endpoint}`)
  )
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

  app.addHook("onRequest", async (request, reply) => {
    requestStartedAt.set(request, performance.now())
    const path = request.url.split("?", 1)[0] ?? request.url
    const protectedRoute =
      path === "/mcp" ||
      protectedRoutes.has(`${request.method.toUpperCase()} ${path}`)

    if (auth.enabled && protectedRoute && !auth.keyId(request.headers)) {
      return reply
        .header("www-authenticate", 'Bearer realm="404.directory"')
        .status(401)
        .send({
          error: "unauthorized",
          message: "A valid API key is required for tool execution.",
        })
    }
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
          auth: auth.enabled ? "configured" : "open",
        },
        "Request completed"
      )
    }
  })

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    keyGenerator: (request) => auth.rateLimitKey(request.headers, request.ip),
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
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "X-API-Key",
          },
          BearerAuth: {
            type: "http",
            scheme: "bearer",
          },
        },
      },
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
        .send(renderHomepage(registry.catalog()))
  )

  app.get(
    "/docs",
    { schema: { hide: true } as FastifySchema },
    async (_request, reply) =>
      reply
        .type("text/markdown; charset=utf-8")
        .send(renderDocs(registry.catalog(), { authRequired: auth.enabled }))
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
          "Machine-friendly catalog of callable tools with schemas, endpoints, and use_when guidance.",
      },
    },
    async () => ({
      service: "404.directory",
      version: SERVICE_VERSION,
      authentication: auth.enabled
        ? {
            required: true,
            schemes: ["Authorization: Bearer <key>", "X-API-Key: <key>"],
          }
        : { required: false },
      tools: registry.catalog(),
    })
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

  for (const tool of registry.listActive()) {
    if (tool.method === "POST") {
      app.post(
        tool.endpoint,
        {
          schema: toolRouteSchema(tool, auth.enabled),
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
          schema: toolRouteSchema(tool, auth.enabled),
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
