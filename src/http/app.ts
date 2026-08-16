import { randomUUID } from "node:crypto"
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
import { renderDocs, renderHomepage } from "./homepage.js"

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
    description: `${tool.description}\n\nWhen to use: ${tool.use_when}`,
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
      message: error instanceof Error ? error.message : "Unexpected tool error",
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
    request.log.error({ err: error }, "Unhandled HTTP error")
    return reply.status(httpError.statusCode ?? 500).send({
      error: "internal_error",
      message: httpError.message || "Unexpected server error",
    })
  })

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({
      error: "not_found",
      message: "Route not found",
    })
  )

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    errorResponseBuilder: () => ({
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
        version: "0.2.0",
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
        .send(renderHomepage(registry.catalog()))
  )

  app.get(
    "/docs",
    { schema: { hide: true } as FastifySchema },
    async (_request, reply) =>
      reply
        .type("text/markdown; charset=utf-8")
        .send(renderDocs(registry.catalog()))
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
            required: ["status", "tools"],
            properties: {
              status: { type: "string", enum: ["ok"] },
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
      version: "0.2.0",
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
        { schema: toolRouteSchema(tool) },
        async (request, reply) => invokeTool(tool, request.body, request, reply)
      )
    } else {
      app.get(
        tool.endpoint,
        { schema: toolRouteSchema(tool) },
        async (request, reply) =>
          invokeTool(tool, request.query, request, reply)
      )
    }
  }

  app.route({
    method: ["GET", "POST", "DELETE"],
    url: "/mcp",
    schema: { hide: true } as FastifySchema,
    handler: async (request, reply) =>
      handleMcpRequest(registry, request, reply),
  })

  await app.ready()
  return app
}
