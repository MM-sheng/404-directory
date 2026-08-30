import { AsyncLocalStorage } from "node:async_hooks"
import { createHmac } from "node:crypto"

export type AgentIdentityKind = "explicit" | "anonymous" | "internal"

export type AgentAttribution = {
  agent_key: string | null
  agent_identity_kind: AgentIdentityKind
  client_name: string | null
  attribution_source: string | null
  is_external: boolean
  request_id: string | null
  /** Irreversible HMAC; the raw MCP session id never leaves this module. */
  session_key: string | null
}

type HeaderValue = string | string[] | undefined
export type AgentHeaders = Record<string, HeaderValue>

const attributionStorage = new AsyncLocalStorage<AgentAttribution>()
const SAFE_AGENT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]{7,127}$/
const SAFE_SOURCE = /^[a-z0-9][a-z0-9._-]{0,63}$/
const BEARER_AGENT_ID = /^Bearer\s+(agent:[a-zA-Z0-9._:@/-]{7,121})$/i
const EMBEDDED_AGENT_SOURCE =
  /^agent:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@([a-z0-9][a-z0-9._-]{0,63})$/i
const KNOWN_NON_USER_CLIENT =
  /404\.directory|gateway-smoke|sentineloracle|glimind-probe|mcpbeat|zevruna|aisec-registry|mcp-cloud-aboutbot|agent-stack-fingerprint|reliability-bureau|mcpharvest/i
const CLIENT_SOURCE_FAMILIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/chatgpt|openai/i, "openai"],
  [/claude|anthropic/i, "claude"],
  [/cursor/i, "cursor"],
  [/cline/i, "cline"],
  [/codex/i, "codex"],
  [/eliza(?:os)?/i, "elizaos"],
  [/openclaw/i, "openclaw"],
  [/visual studio code|vscode/i, "vscode"],
  [/goose/i, "goose"],
  [/mcp[ /_-]?inspector/i, "mcp-inspector"],
]

/**
 * Convert a validated opt-in Agent installation ID to the exact digest used by
 * invocation attribution. Raw installation IDs must never be persisted.
 */
export function hashAgentInstallationId(
  rawAgentId: string,
  salt: string
): string | null {
  if (!SAFE_AGENT_ID.test(rawAgentId)) return null
  return `a1_${createHmac("sha256", salt)
    .update(rawAgentId)
    .digest("hex")
    .slice(0, 40)}`
}

function firstHeader(headers: AgentHeaders, name: string): string | undefined {
  const wanted = name.toLowerCase()
  const value = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === wanted
  )?.[1]
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === "string" ? first.trim() : undefined
}

function boundedClientName(value: string | undefined): string | null {
  if (!value) return null
  return value.replace(/[\r\n]/g, " ").slice(0, 96)
}

function clientSourceFamily(value: string | null): string | null {
  if (!value) return null
  return (
    CLIENT_SOURCE_FAMILIES.find(([pattern]) => pattern.test(value))?.[1] ?? null
  )
}

/**
 * Builds privacy-safe Agent attribution from opt-in MCP/HTTP headers.
 * The raw Agent ID is never persisted; only an HMAC digest leaves this module.
 */
export function agentAttributionFromHeaders(
  headers: AgentHeaders,
  salt: string,
  mcpClientHint?: string,
  requestMeta?: { request_id?: string | null; session_id?: string | null }
): AgentAttribution {
  const authorization = firstHeader(headers, "authorization")
  const bearerAgentId = authorization?.match(BEARER_AGENT_ID)?.[1]
  const rawAgentId = firstHeader(headers, "x-404-agent-id") ?? bearerAgentId
  const explicit = Boolean(rawAgentId && SAFE_AGENT_ID.test(rawAgentId))
  const requestedClass = firstHeader(headers, "x-404-agent-class")
  const internal = requestedClass?.toLowerCase() === "internal"
  const clientName = boundedClientName(
    firstHeader(headers, "x-404-client-name") ??
      mcpClientHint ??
      firstHeader(headers, "user-agent")
  )
  const embeddedSource = rawAgentId
    ?.match(EMBEDDED_AGENT_SOURCE)?.[1]
    ?.toLowerCase()
  const sourceValue =
    firstHeader(headers, "x-404-source")?.toLowerCase() ?? embeddedSource
  const attributionSource =
    sourceValue && SAFE_SOURCE.test(sourceValue)
      ? sourceValue
      : (clientSourceFamily(clientName) ?? "direct")
  const knownNonUserClient = Boolean(
    clientName && KNOWN_NON_USER_CLIENT.test(clientName)
  )
  const rawSessionId =
    requestMeta?.session_id ?? firstHeader(headers, "mcp-session-id") ?? null

  return {
    agent_key:
      explicit && rawAgentId ? hashAgentInstallationId(rawAgentId, salt) : null,
    agent_identity_kind: internal
      ? "internal"
      : explicit
        ? "explicit"
        : "anonymous",
    client_name: clientName,
    attribution_source: attributionSource,
    is_external: !internal && !knownNonUserClient,
    request_id: requestMeta?.request_id?.slice(0, 128) ?? null,
    session_key: rawSessionId
      ? `s1_${createHmac("sha256", salt)
          .update(`mcp-session:${rawSessionId}`)
          .digest("hex")
          .slice(0, 40)}`
      : null,
  }
}

export function withAgentAttribution<T>(
  attribution: AgentAttribution,
  run: () => T
): T {
  return attributionStorage.run(attribution, run)
}

export function currentAgentAttribution(): AgentAttribution | undefined {
  return attributionStorage.getStore()
}
