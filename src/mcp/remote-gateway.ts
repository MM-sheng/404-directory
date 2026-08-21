import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { CatalogTool } from "../domain/types.js"
import { createPinnedFetch } from "../security/pinned-http.js"
import { resolvePublicHttpUrl } from "../security/url.js"
import { SERVICE_VERSION } from "../version.js"

export type GatewayPolicy = {
  enabled: true
  mode: "read_only_allowlist"
  allowedTools: string[]
}

export type RemoteToolDescriptor = {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
  annotations?: Record<string, unknown>
}

export type RemoteInvocationResult = {
  is_error: boolean
  content: Array<Record<string, unknown>>
  structured_content?: Record<string, unknown>
  truncated: boolean
}

export interface RemoteMcpGateway {
  inspect(server: CatalogTool): Promise<RemoteToolDescriptor[]>
  invoke(
    server: CatalogTool,
    remoteToolName: string,
    args: Record<string, unknown>
  ): Promise<RemoteInvocationResult>
}

export class GatewayError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "GatewayError"
  }
}

export function readGatewayPolicy(tool: CatalogTool): GatewayPolicy | null {
  const raw = tool.metadata.gateway
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const policy = raw as Record<string, unknown>
  if (policy.enabled !== true || policy.mode !== "read_only_allowlist") {
    return null
  }
  if (
    !Array.isArray(policy.allowed_tools) ||
    policy.allowed_tools.length === 0 ||
    policy.allowed_tools.length > 64 ||
    policy.allowed_tools.some(
      (name) =>
        typeof name !== "string" || name.length === 0 || name.length > 128
    )
  ) {
    return null
  }
  return {
    enabled: true,
    mode: "read_only_allowlist",
    allowedTools: [...new Set(policy.allowed_tools as string[])],
  }
}

function publicGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error
  const message = error instanceof Error ? error.message : "unknown error"
  if (/timeout|aborted|abort/i.test(message)) {
    return new GatewayError(
      "remote_timeout",
      "The remote MCP server did not respond before the gateway timeout. Retry later or choose another server."
    )
  }
  if (/rate|429/i.test(message)) {
    return new GatewayError(
      "remote_rate_limited",
      "The remote MCP server is rate limited. Retry later or choose another server."
    )
  }
  return new GatewayError(
    "remote_unavailable",
    "The remote MCP server could not complete the request. Retry later or inspect its current status."
  )
}

function jsonSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8")
}

function normalizeResult(
  input: unknown,
  maxResultBytes: number
): RemoteInvocationResult {
  const outer =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {}
  const result =
    outer.toolResult &&
    typeof outer.toolResult === "object" &&
    !Array.isArray(outer.toolResult)
      ? (outer.toolResult as Record<string, unknown>)
      : outer
  const content = Array.isArray(result.content) ? result.content : []
  const normalized: Array<Record<string, unknown>> = []
  let remaining = maxResultBytes
  let truncated = false

  for (const block of content) {
    if (!block || typeof block !== "object") continue
    const record = block as Record<string, unknown>
    if (record.type === "text" && typeof record.text === "string") {
      const text = record.text
      const bounded = Buffer.from(text, "utf8")
        .subarray(0, remaining)
        .toString()
      normalized.push({ type: "text", text: bounded })
      remaining = Math.max(0, remaining - Buffer.byteLength(bounded, "utf8"))
      if (bounded.length < text.length) truncated = true
    } else if (record.type === "resource_link") {
      normalized.push({
        type: "resource_link",
        name: typeof record.name === "string" ? record.name : undefined,
        uri: typeof record.uri === "string" ? record.uri : undefined,
        mimeType:
          typeof record.mimeType === "string" ? record.mimeType : undefined,
      })
    } else {
      // Images, audio, embedded resources, and unknown binary-bearing blocks
      // are deliberately not relayed by the public v1 gateway.
      normalized.push({
        type: typeof record.type === "string" ? record.type : "unknown",
        omitted: true,
      })
      truncated = true
    }
    if (remaining === 0) break
  }

  let structuredContent: Record<string, unknown> | undefined
  if (
    result.structuredContent &&
    typeof result.structuredContent === "object" &&
    !Array.isArray(result.structuredContent) &&
    jsonSize(result.structuredContent) <= Math.floor(maxResultBytes / 2)
  ) {
    structuredContent = result.structuredContent as Record<string, unknown>
  } else if (result.structuredContent !== undefined) {
    truncated = true
  }

  return {
    is_error: result.isError === true,
    content: normalized,
    ...(structuredContent ? { structured_content: structuredContent } : {}),
    truncated,
  }
}

export function createRemoteMcpGateway(options: {
  timeoutMs: number
  maxResultBytes: number
}): RemoteMcpGateway {
  async function withClient<T>(
    server: CatalogTool,
    run: (client: Client) => Promise<T>
  ): Promise<T> {
    if (!server.endpoint) {
      throw new GatewayError(
        "missing_endpoint",
        "Catalog server has no endpoint."
      )
    }
    const signal = AbortSignal.timeout(options.timeoutMs)
    let client: Client | undefined
    let transport: StreamableHTTPClientTransport | undefined
    try {
      const resolved = await resolvePublicHttpUrl(server.endpoint)
      transport = new StreamableHTTPClientTransport(resolved.url, {
        fetch: createPinnedFetch(resolved),
        requestInit: {
          signal,
          headers: {
            "user-agent": `404.directory-gateway/${SERVICE_VERSION}`,
          },
        },
      })
      client = new Client({
        name: "404.directory-gateway",
        version: SERVICE_VERSION,
      })
      await client.connect(transport)
      return await run(client)
    } catch (error) {
      throw publicGatewayError(error)
    } finally {
      await client?.close().catch(() => undefined)
      await transport?.close().catch(() => undefined)
    }
  }

  return {
    async inspect(server) {
      const policy = readGatewayPolicy(server)
      if (!policy) {
        throw new GatewayError(
          "gateway_not_allowed",
          "This catalog server is not approved for gateway execution."
        )
      }
      return withClient(server, async (client) => {
        const listed = await client.listTools()
        return listed.tools
          .filter((tool) => policy.allowedTools.includes(tool.name))
          .filter((tool) => tool.annotations?.destructiveHint !== true)
          .map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema as Record<string, unknown>,
            annotations: tool.annotations as
              Record<string, unknown> | undefined,
          }))
      })
    },

    async invoke(server, remoteToolName, args) {
      const policy = readGatewayPolicy(server)
      if (!policy?.allowedTools.includes(remoteToolName)) {
        throw new GatewayError(
          "remote_tool_not_allowed",
          `Remote tool '${remoteToolName}' is not on this server's read-only allowlist.`
        )
      }
      return withClient(server, async (client) => {
        const listed = await client.listTools()
        const remoteTool = listed.tools.find(
          (candidate) => candidate.name === remoteToolName
        )
        if (!remoteTool) {
          throw new GatewayError(
            "remote_tool_missing",
            `Remote tool '${remoteToolName}' is no longer exposed by the server. Inspect the server again.`
          )
        }
        if (remoteTool.annotations?.destructiveHint === true) {
          throw new GatewayError(
            "remote_tool_became_destructive",
            `Remote tool '${remoteToolName}' now declares destructive behavior and was blocked.`
          )
        }
        const result = await client.callTool({
          name: remoteToolName,
          arguments: args,
        })
        return normalizeResult(result, options.maxResultBytes)
      })
    },
  }
}
