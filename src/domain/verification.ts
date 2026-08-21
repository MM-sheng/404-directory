import { performance } from "node:perf_hooks"
import { resolvePublicHttpUrl, UnsafeUrlError } from "../security/url.js"
import type { z } from "zod"
import type { CatalogStore } from "./store.js"
import { refreshTrustForTool } from "./trust.js"
import { CheckStatusSchema, CheckTypeSchema } from "./types.js"

type CheckType = z.infer<typeof CheckTypeSchema>
type CheckStatus = z.infer<typeof CheckStatusSchema>

type CheckResult = {
  check_type: CheckType
  status: CheckStatus
  latency_ms: number | null
  evidence: Record<string, unknown>
}

async function timedFetch(
  url: string,
  init?: RequestInit
): Promise<{
  ok: boolean
  status: number
  latency_ms: number
  bodyText: string
  headers: Headers
  error?: string
}> {
  const started = performance.now()
  try {
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    })
    const bodyText = await response.text().catch(() => "")
    return {
      ok: response.ok,
      status: response.status,
      latency_ms: Math.round(performance.now() - started),
      bodyText: bodyText.slice(0, 4_096),
      headers: response.headers,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latency_ms: Math.round(performance.now() - started),
      bodyText: "",
      headers: new Headers(),
      error: error instanceof Error ? error.name : "fetch_failed",
    }
  }
}

async function runChecksForEndpoint(input: {
  url: string
  transport: string
}): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  // TLS / URL safety
  try {
    const resolved = await resolvePublicHttpUrl(input.url)
    const isHttps = resolved.url.protocol === "https:"
    results.push({
      check_type: "tls_security",
      status: isHttps ? "pass" : "warn",
      latency_ms: null,
      evidence: {
        protocol: resolved.url.protocol,
        public_addresses: resolved.addresses.map((a) => a.address),
        https: isHttps,
      },
    })
  } catch (error) {
    results.push({
      check_type: "tls_security",
      status: "fail",
      latency_ms: null,
      evidence: {
        error:
          error instanceof UnsafeUrlError
            ? error.message
            : "url_validation_failed",
      },
    })
    // If URL is unsafe, skip network checks.
    return results
  }

  const availability = await timedFetch(input.url, {
    method: input.transport.startsWith("mcp") ? "POST" : "GET",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      ...(input.transport.startsWith("mcp")
        ? {
            "mcp-protocol-version": "2024-11-05",
          }
        : {}),
    },
    body: input.transport.startsWith("mcp")
      ? JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "404.directory-verifier", version: "0.1.0" },
          },
        })
      : undefined,
  })

  results.push({
    check_type: "endpoint_availability",
    status:
      availability.status > 0 && availability.status < 500 ? "pass" : "fail",
    latency_ms: availability.latency_ms,
    evidence: {
      http_status: availability.status,
      error: availability.error,
    },
  })

  results.push({
    check_type: "latency",
    status:
      availability.latency_ms <= 2_000
        ? "pass"
        : availability.latency_ms <= 5_000
          ? "warn"
          : "fail",
    latency_ms: availability.latency_ms,
    evidence: { latency_ms: availability.latency_ms, threshold_ms: 2000 },
  })

  if (input.transport.startsWith("mcp")) {
    let handshakePass = false
    try {
      const parsed = JSON.parse(availability.bodyText) as {
        result?: { protocolVersion?: string; serverInfo?: unknown }
        error?: unknown
      }
      handshakePass = Boolean(parsed.result?.protocolVersion) && !parsed.error
      results.push({
        check_type: "mcp_handshake",
        status: handshakePass ? "pass" : "fail",
        latency_ms: availability.latency_ms,
        evidence: {
          protocol_version: parsed.result?.protocolVersion ?? null,
          has_server_info: Boolean(parsed.result?.serverInfo),
          error: parsed.error ?? availability.error ?? null,
        },
      })
    } catch {
      results.push({
        check_type: "mcp_handshake",
        status: "fail",
        latency_ms: availability.latency_ms,
        evidence: { error: "invalid_json_or_non_mcp_response" },
      })
    }

    // tools/list — best-effort follow-up when handshake may have worked
    if (handshakePass || availability.status > 0) {
      const list = await timedFetch(input.url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "mcp-protocol-version": "2024-11-05",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }),
      })
      let toolsCount: number | null = null
      let listOk = false
      try {
        const parsed = JSON.parse(list.bodyText) as {
          result?: { tools?: unknown[] }
        }
        toolsCount = Array.isArray(parsed.result?.tools)
          ? parsed.result!.tools!.length
          : null
        listOk = toolsCount !== null
      } catch {
        listOk = false
      }
      results.push({
        check_type: "tools_list",
        status: listOk ? "pass" : "fail",
        latency_ms: list.latency_ms,
        evidence: { tools_count: toolsCount, http_status: list.status },
      })
      results.push({
        check_type: "schema_consistency",
        status: listOk ? "pass" : "warn",
        latency_ms: list.latency_ms,
        evidence: {
          note: "v1 checks tools/list presence; deep schema diff comes later",
          tools_count: toolsCount,
        },
      })
    } else {
      results.push({
        check_type: "tools_list",
        status: "error",
        latency_ms: null,
        evidence: { skipped: true, reason: "handshake_failed" },
      })
      results.push({
        check_type: "schema_consistency",
        status: "error",
        latency_ms: null,
        evidence: { skipped: true, reason: "handshake_failed" },
      })
    }
  } else {
    // Non-MCP: mark protocol-specific checks as warn/skip so trust dims still work
    results.push({
      check_type: "mcp_handshake",
      status: "warn",
      latency_ms: null,
      evidence: { skipped: true, reason: "not_mcp_transport" },
    })
    results.push({
      check_type: "tools_list",
      status: "warn",
      latency_ms: null,
      evidence: { skipped: true, reason: "not_mcp_transport" },
    })
    results.push({
      check_type: "schema_consistency",
      status: "warn",
      latency_ms: null,
      evidence: { skipped: true, reason: "not_mcp_transport" },
    })
  }

  // error_rate placeholder from this single probe (full rate needs invocations)
  results.push({
    check_type: "error_rate",
    status: availability.ok || availability.status < 500 ? "pass" : "fail",
    latency_ms: availability.latency_ms,
    evidence: {
      probe_ok: availability.ok,
      note: "v1 uses verification probe; production rate uses invocation telemetry",
    },
  })

  return results
}

export async function verifyTool(
  store: CatalogStore,
  toolId: string
): Promise<CheckResult[]> {
  const endpoint = await store.getEndpointForTool(toolId)
  if (!endpoint) {
    const missing: CheckResult = {
      check_type: "endpoint_availability",
      status: "error",
      latency_ms: null,
      evidence: { error: "no_endpoint" },
    }
    await store.insertVerificationCheck({
      tool_id: toolId,
      endpoint_id: null,
      check_type: missing.check_type,
      status: missing.status,
      latency_ms: missing.latency_ms,
      evidence: missing.evidence,
    })
    return [missing]
  }

  const results = await runChecksForEndpoint(endpoint)
  for (const result of results) {
    await store.insertVerificationCheck({
      tool_id: toolId,
      endpoint_id: endpoint.id,
      check_type: result.check_type,
      status: result.status,
      latency_ms: result.latency_ms,
      evidence: result.evidence,
    })
  }
  await refreshTrustForTool(store, toolId)
  return results
}

export type VerificationWorkerOptions = {
  store: CatalogStore
  intervalMs: number
  batchSize: number
  enabled: boolean
  log?: (message: string, data?: Record<string, unknown>) => void
}

/**
 * Lightweight in-process verification loop.
 * Production can later split this into a dedicated worker process.
 */
export function startVerificationWorker(options: VerificationWorkerOptions): {
  stop: () => void
} {
  if (!options.enabled) {
    return { stop: () => undefined }
  }

  let stopped = false

  const tick = async () => {
    if (stopped) return
    try {
      const ids = await options.store.listToolIdsForVerification(
        options.batchSize
      )
      for (const id of ids) {
        if (stopped) break
        await verifyTool(options.store, id)
      }
      options.log?.("verification_worker_tick", { verified: ids.length })
    } catch (error) {
      options.log?.("verification_worker_error", {
        error: error instanceof Error ? error.message : "unknown",
      })
    }
  }

  // Kick once shortly after boot, then on interval.
  const boot = setTimeout(() => void tick(), 2_000)
  const timer = setInterval(() => void tick(), options.intervalMs)

  return {
    stop: () => {
      stopped = true
      clearTimeout(boot)
      clearInterval(timer)
    },
  }
}
