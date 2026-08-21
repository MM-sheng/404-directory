import { performance } from "node:perf_hooks"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import {
  createPinnedFetch,
  pinnedRequestUrl,
} from "../security/pinned-http.js"
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

const MAX_VERIFY_BODY = 64 * 1024

async function runMcpProtocolChecks(
  url: string
): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const started = performance.now()
  try {
    const resolved = await resolvePublicHttpUrl(url)
    const transport = new StreamableHTTPClientTransport(resolved.url, {
      fetch: createPinnedFetch(resolved),
      requestInit: {
        headers: {
          "user-agent": "404.directory-verifier/0.5",
        },
      },
    })
    const client = new Client({
      name: "404.directory-verifier",
      version: "0.5.0",
    })
    await client.connect(transport)
    const latencyMs = Math.round(performance.now() - started)
    results.push({
      check_type: "mcp_handshake",
      status: "pass",
      latency_ms: latencyMs,
      evidence: {
        protocol: "mcp",
        transport: "streamable-http",
        pinned: true,
      },
    })

    const listed = await client.listTools()
    const toolsCount = listed.tools?.length ?? 0
    results.push({
      check_type: "tools_list",
      status: toolsCount > 0 ? "pass" : "warn",
      latency_ms: Math.round(performance.now() - started),
      evidence: { tools_count: toolsCount },
    })
    results.push({
      check_type: "schema_consistency",
      status: toolsCount > 0 ? "pass" : "warn",
      latency_ms: Math.round(performance.now() - started),
      evidence: {
        note: "v1 checks tools/list via MCP SDK; deep schema diff later",
        tools_count: toolsCount,
      },
    })

    await client.close().catch(() => undefined)
    await transport.close().catch(() => undefined)
  } catch (error) {
    results.push({
      check_type: "mcp_handshake",
      status: "fail",
      latency_ms: Math.round(performance.now() - started),
      evidence: {
        error: error instanceof Error ? error.message : "mcp_connect_failed",
      },
    })
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
  return results
}

async function runChecksForEndpoint(input: {
  url: string
  transport: string
}): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  let resolved
  try {
    resolved = await resolvePublicHttpUrl(input.url)
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
    return results
  }

  const started = performance.now()
  let availability: {
    ok: boolean
    status: number
    latency_ms: number
    error?: string
  }

  try {
    const response = await pinnedRequestUrl(input.url, {
      method: "GET",
      headers: { accept: "text/html,application/json,*/*" },
      maxBodyBytes: MAX_VERIFY_BODY,
      signal: AbortSignal.timeout(8_000),
    })
    availability = {
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      latency_ms: Math.round(performance.now() - started),
    }
  } catch (error) {
    availability = {
      ok: false,
      status: 0,
      latency_ms: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : "fetch_failed",
    }
  }

  results.push({
    check_type: "endpoint_availability",
    status:
      availability.status > 0 && availability.status < 500 ? "pass" : "fail",
    latency_ms: availability.latency_ms,
    evidence: {
      http_status: availability.status,
      error: availability.error,
      pinned: true,
    },
  })

  results.push({
    check_type: "latency",
    status:
      availability.status === 0
        ? "fail"
        : availability.latency_ms <= 2_000
          ? "pass"
          : availability.latency_ms <= 5_000
            ? "warn"
            : "fail",
    latency_ms: availability.latency_ms,
    evidence: { latency_ms: availability.latency_ms, threshold_ms: 2000 },
  })

  // Network failure (status 0) must not pass error_rate.
  results.push({
    check_type: "error_rate",
    status:
      availability.status > 0 && availability.status < 500 ? "pass" : "fail",
    latency_ms: availability.latency_ms,
    evidence: {
      probe_ok: availability.ok,
      http_status: availability.status,
      note: "v1 probe; production rate uses invocation telemetry",
    },
  })

  if (input.transport.startsWith("mcp")) {
    results.push(...(await runMcpProtocolChecks(input.url)))
  } else {
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

  const tool = await store.getToolById(toolId)
  const availabilityPass = results.some(
    (r) => r.check_type === "endpoint_availability" && r.status === "pass"
  )
  if (tool?.provider.verified && availabilityPass && tool.status === "pending") {
    await store.setToolStatus(toolId, "active")
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

export function startVerificationWorker(
  options: VerificationWorkerOptions
): { stop: () => void } {
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
