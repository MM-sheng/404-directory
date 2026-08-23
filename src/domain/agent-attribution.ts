import { AsyncLocalStorage } from "node:async_hooks"
import { createHmac } from "node:crypto"

export type AgentIdentityKind = "explicit" | "anonymous" | "internal"

export type AgentAttribution = {
  agent_key: string | null
  agent_identity_kind: AgentIdentityKind
  client_name: string | null
  attribution_source: string | null
  is_external: boolean
}

type HeaderValue = string | string[] | undefined
export type AgentHeaders = Record<string, HeaderValue>

const attributionStorage = new AsyncLocalStorage<AgentAttribution>()
const SAFE_AGENT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]{7,127}$/
const SAFE_SOURCE = /^[a-z0-9][a-z0-9._-]{0,63}$/
const KNOWN_NON_USER_CLIENT =
  /404\.directory|gateway-smoke|sentineloracle|glimind-probe|mcpbeat|zevruna|aisec-registry|mcp-cloud-aboutbot|agent-stack-fingerprint|reliability-bureau|mcpharvest/i
const CLIENT_SOURCE_FAMILIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/chatgpt|openai/i, "openai"],
  [/claude|anthropic/i, "claude"],
  [/cursor/i, "cursor"],
  [/cline/i, "cline"],
  [/codex/i, "codex"],
  [/visual studio code|vscode/i, "vscode"],
  [/goose/i, "goose"],
  [/mcp[ /_-]?inspector/i, "mcp-inspector"],
]

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
  mcpClientHint?: string
): AgentAttribution {
  const rawAgentId = firstHeader(headers, "x-404-agent-id")
  const explicit = Boolean(rawAgentId && SAFE_AGENT_ID.test(rawAgentId))
  const requestedClass = firstHeader(headers, "x-404-agent-class")
  const internal = requestedClass?.toLowerCase() === "internal"
  const clientName = boundedClientName(
    firstHeader(headers, "x-404-client-name") ??
      mcpClientHint ??
      firstHeader(headers, "user-agent")
  )
  const sourceValue = firstHeader(headers, "x-404-source")?.toLowerCase()
  const attributionSource =
    sourceValue && SAFE_SOURCE.test(sourceValue)
      ? sourceValue
      : (clientSourceFamily(clientName) ?? "direct")
  const knownNonUserClient = Boolean(
    clientName && KNOWN_NON_USER_CLIENT.test(clientName)
  )

  return {
    agent_key:
      explicit && rawAgentId
        ? `a1_${createHmac("sha256", salt)
            .update(rawAgentId)
            .digest("hex")
            .slice(0, 40)}`
        : null,
    agent_identity_kind: internal
      ? "internal"
      : explicit
        ? "explicit"
        : "anonymous",
    client_name: clientName,
    attribution_source: attributionSource,
    is_external: !internal && !knownNonUserClient,
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
