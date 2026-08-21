import type { CatalogStore } from "./store.js"
import type { InvocationEvent } from "./types.js"

/**
 * Privacy-safe invocation telemetry.
 * Records only: tool identity, version, latency, success, error type.
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
    await store.recordInvocation({
      tool_id: toolId,
      tool_name: event.tool_name.slice(0, 128),
      version: event.version?.slice(0, 64) ?? null,
      source: event.source.slice(0, 32),
      success: event.success,
      latency_ms: Math.max(0, Math.round(event.latency_ms)),
      error_type: event.error_type ? event.error_type.slice(0, 64) : null,
    })
  } catch {
    // Telemetry must never break tool execution.
  }
}

export function classifyErrorType(error: unknown): string {
  if (!error) return "unknown"
  if (typeof error === "string") return error.slice(0, 64)
  if (error instanceof Error) {
    if (/timeout|exceeded/i.test(error.message)) return "timeout"
    if (/unsafe|private|reserved/i.test(error.message)) return "unsafe_url"
    if (/validation|invalid/i.test(error.message)) return "validation"
    return "execution_failed"
  }
  return "unknown"
}
