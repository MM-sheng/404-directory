import type { CatalogStore } from "./store.js"
import type { InvocationEvent } from "./types.js"
import { currentAgentAttribution } from "./agent-attribution.js"

/**
 * Privacy-safe invocation telemetry.
 * Records tool identity, latency, success, error type, and privacy-safe
 * request/session correlation. Never stores raw session ids.
 * Never stores request bodies, URLs, prompts, or user content.
 */
export async function trackInvocation(
  store: CatalogStore | null | undefined,
  event: InvocationEvent
): Promise<void> {
  if (!store) return
  try {
    let toolId = event.tool_id ?? null
    if (!toolId && event.tool_name) {
      const catalogTool = await store.getToolBySlug(event.tool_name)
      toolId = catalogTool?.id ?? null
    }
    const attribution = currentAgentAttribution()
    const completedAt = event.completed_at ?? new Date().toISOString()
    const startedAt =
      event.started_at ??
      new Date(Date.now() - Math.max(0, event.latency_ms)).toISOString()
    await store.recordInvocation({
      tool_id: toolId,
      tool_name: event.tool_name.slice(0, 128),
      version: event.version?.slice(0, 64) ?? null,
      source: event.source.slice(0, 32),
      success: event.success,
      latency_ms: Math.max(0, Math.round(event.latency_ms)),
      error_type: event.error_type
        ? normalizeErrorType(event.error_type)
        : null,
      agent_key: event.agent_key ?? attribution?.agent_key ?? null,
      agent_identity_kind:
        event.agent_identity_kind ??
        attribution?.agent_identity_kind ??
        "anonymous",
      client_name:
        event.client_name?.slice(0, 96) ?? attribution?.client_name ?? null,
      attribution_source:
        event.attribution_source?.slice(0, 64) ??
        attribution?.attribution_source ??
        "direct",
      is_external: event.is_external ?? attribution?.is_external ?? false,
      request_id:
        event.request_id?.slice(0, 128) ??
        attribution?.request_id?.slice(0, 128) ??
        null,
      session_key:
        event.session_key?.slice(0, 64) ??
        attribution?.session_key?.slice(0, 64) ??
        null,
      result_count:
        typeof event.result_count === "number" &&
        Number.isFinite(event.result_count)
          ? Math.max(0, Math.round(event.result_count))
          : null,
      started_at: startedAt,
      completed_at: completedAt,
    })
  } catch {
    // Telemetry must never break tool execution.
  }
}

export function classifyErrorType(error: unknown): string {
  if (!error) return "unknown"
  if (typeof error === "string") return normalizeErrorType(error)
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code
    if (typeof code === "string") {
      const classifiedCode = normalizeErrorType(code)
      if (classifiedCode !== "unknown") return classifiedCode
    }
    return normalizeErrorType(`${error.name} ${error.message}`)
  }
  return "unknown"
}

export type CanonicalErrorType =
  | "invalid_arguments"
  | "protocol_mismatch"
  | "tool_not_found"
  | "tool_not_allowed"
  | "authentication_not_supported"
  | "provider_not_verified"
  | "provider_timeout"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "empty_result"
  | "unsafe_url"
  | "client_disconnected"
  | "tool_execution_failed"
  | "unknown"

/**
 * Converts provider/library errors into a finite, non-sensitive taxonomy.
 * Raw exception text is never persisted as an analytics dimension.
 */
export function normalizeErrorType(value: string): CanonicalErrorType {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
  if (/rate.?limit|too_many_requests|\b429\b/.test(normalized)) {
    return "provider_rate_limited"
  }
  if (/timeout|timed_out|exceeded/.test(normalized)) return "provider_timeout"
  if (
    /disconnect|socket_closed|connection_reset|econnreset|broken_pipe/.test(
      normalized
    )
  ) {
    return "client_disconnected"
  }
  if (/protocol|unsupported_protocol|version_mismatch/.test(normalized)) {
    return "protocol_mismatch"
  }
  if (
    /authentication_not_supported|auth_required|credentials_required/.test(
      normalized
    )
  ) {
    return "authentication_not_supported"
  }
  if (/provider_not_verified|ownership_not_verified/.test(normalized)) {
    return "provider_not_verified"
  }
  if (/unsafe|private|reserved|ssrf/.test(normalized)) return "unsafe_url"
  if (
    /validation|invalid|arguments_too_large|bad_request|zoderror/.test(
      normalized
    )
  ) {
    return "invalid_arguments"
  }
  if (/not_allowed|became_destructive|destructive|forbidden/.test(normalized)) {
    return "tool_not_allowed"
  }
  if (
    /not_found|unknown_server|remote_tool_missing|missing_tool/.test(normalized)
  ) {
    return "tool_not_found"
  }
  if (/empty_result|no_results|zero_results/.test(normalized)) {
    return "empty_result"
  }
  if (
    /unavailable|gateway_failed|all_sources_failed|missing_endpoint|server_not_active|network|dns|econnrefused/.test(
      normalized
    )
  ) {
    return "provider_unavailable"
  }
  if (/execution|tool_error|remote_tool_error|failed|error/.test(normalized)) {
    return "tool_execution_failed"
  }
  return "unknown"
}

/** Best-effort count of result items without retaining result content. */
export function estimateResultCount(value: unknown): number | null {
  if (value == null) return null
  if (Array.isArray(value)) return value.length
  if (typeof value !== "object") return null
  const record = value as Record<string, unknown>
  for (const key of [
    "count",
    "result_count",
    "tools",
    "results",
    "documents",
    "hits",
    "related",
    "capabilities",
  ]) {
    const candidate = record[key]
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.max(0, Math.round(candidate))
    }
    if (Array.isArray(candidate)) return candidate.length
  }
  return null
}
