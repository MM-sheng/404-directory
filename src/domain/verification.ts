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
import { nextLifecycleStatus } from "./lifecycle.js"
import { refreshTrustForTool } from "./trust.js"
import { CheckStatusSchema, CheckTypeSchema } from "./types.js"

type CheckType = z.infer<typeof CheckTypeSchema>
type CheckStatus = z.infer<typeof CheckStatusSchema>

export type CheckResult = {
  check_type: CheckType
  status: CheckStatus
  latency_ms: number | null
  evidence: Record<string, unknown>
}

const MAX_VERIFY_BODY = 64 * 1024

function checkOf(
  results: CheckResult[],
  type: CheckType
): CheckResult | undefined {
  return results.find((r) => r.check_type === type)
}

/**
 * Trust scores are informational. Activation requires protocol admission.
 * - Provider ownership verified
 * - TLS must pass (HTTPS)
 * - MCP: initialize + tools/list must both pass
 * - API: reachable 2xx/3xx probe
 */
export function meetsActivationCriteria(input: {
  providerVerified: boolean
  transport: string
  results: CheckResult[]
}): boolean {
  if (!input.providerVerified) return false
  const tls = checkOf(input.results, "tls_security")
  if (!tls || tls.status !== "pass") return false

  if (input.transport.startsWith("mcp")) {
    const handshake = checkOf(input.results, "mcp_handshake")
    const toolsList = checkOf(input.results, "tools_list")
    return handshake?.status === "pass" && toolsList?.status === "pass"
  }

  const availability = checkOf(input.results, "endpoint_availability")
  return availability?.status === "pass"
}

function isSuccessHttpStatus(status: number): boolean {
  return status >= 200 && status < 400
}

async function runMcpProtocolChecks(url: string): Promise<CheckResult[]> {
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
      version: "0.5.1",
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
      // Empty catalog is not an admissible MCP server for activation.
      status: toolsCount > 0 ? "pass" : "fail",
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
  probeMethod?: "GET" | "HEAD" | "POST"
}): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  if (input.transport === "mcp_stdio") {
    results.push({
      check_type: "tls_security",
      status: "fail",
      latency_ms: null,
      evidence: {
        error: "mcp_stdio_not_supported",
        note: "Remote verification requires mcp_http",
      },
    })
    return results
  }

  const isMcp = input.transport.startsWith("mcp")
  let resolved
  try {
    resolved = await resolvePublicHttpUrl(input.url)
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

  const isHttps = resolved.url.protocol === "https:"
  if (!isHttps) {
    results.push({
      check_type: "tls_security",
      status: "fail",
      latency_ms: null,
      evidence: {
        protocol: resolved.url.protocol,
        https: false,
        note: "Activation requires HTTPS with a successful TLS handshake",
      },
    })
    return results
  }

  if (isMcp) {
    const mcpResults = await runMcpProtocolChecks(input.url)
    results.push(...mcpResults)
    const handshake = checkOf(mcpResults, "mcp_handshake")
    const handshakePass = handshake?.status === "pass"
    const tlsError =
      !handshakePass &&
      isTlsErrorMessage(String(handshake?.evidence?.error ?? ""))
    results.push({
      check_type: "tls_security",
      status: handshakePass ? "pass" : tlsError ? "fail" : "warn",
      latency_ms: handshake?.latency_ms ?? null,
      evidence: {
        protocol: "https:",
        https: true,
        tls_handshake: handshakePass,
        public_addresses: resolved.addresses.map((a) => a.address),
        note: handshakePass
          ? "TLS validated by successful MCP Streamable HTTP session"
          : "HTTPS URL alone is insufficient; TLS score requires a successful handshake",
      },
    })
    results.push({
      check_type: "endpoint_availability",
      status: handshakePass ? "pass" : "fail",
      latency_ms: handshake?.latency_ms ?? null,
      evidence: {
        derived_from: "mcp_handshake",
        note: "MCP availability is protocol success, not bare HTTP status",
      },
    })
    results.push({
      check_type: "latency",
      status:
        !handshake?.latency_ms
          ? "fail"
          : handshake.latency_ms <= 2_000
            ? "pass"
            : handshake.latency_ms <= 5_000
              ? "warn"
              : "fail",
      latency_ms: handshake?.latency_ms ?? null,
      evidence: {
        latency_ms: handshake?.latency_ms ?? null,
        threshold_ms: 2000,
      },
    })
    results.push({
      check_type: "error_rate",
      status: handshakePass ? "pass" : "fail",
      latency_ms: handshake?.latency_ms ?? null,
      evidence: {
        probe_ok: handshakePass,
        note: "v1 MCP probe; production rate uses invocation telemetry",
      },
    })
    return results
  }

  // Non-MCP (API / A2A): public probe URL with expected method (no secrets).
  const method = input.probeMethod ?? "GET"
  const started = performance.now()
  let availability: {
    ok: boolean
    status: number
    latency_ms: number
    error?: string
    tlsOk: boolean
  }

  try {
    const response = await pinnedRequestUrl(input.url, {
      method,
      headers: { accept: "application/json, text/plain, */*" },
      maxBodyBytes: MAX_VERIFY_BODY,
      signal: AbortSignal.timeout(8_000),
      body: method === "POST" ? "{}" : undefined,
    })
    availability = {
      ok: isSuccessHttpStatus(response.status),
      status: response.status,
      latency_ms: Math.round(performance.now() - started),
      tlsOk: true,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch_failed"
    availability = {
      ok: false,
      status: 0,
      latency_ms: Math.round(performance.now() - started),
      error: message,
      tlsOk: !isTlsErrorMessage(message),
    }
  }

  results.push({
    check_type: "tls_security",
    status: availability.tlsOk && availability.status > 0 ? "pass" : "fail",
    latency_ms: availability.latency_ms,
    evidence: {
      protocol: "https:",
      https: true,
      tls_handshake: availability.tlsOk && availability.status > 0,
      public_addresses: resolved.addresses.map((a) => a.address),
      error: availability.error,
      note: "Security score requires a completed TLS handshake, not only https://",
    },
  })

  results.push({
    check_type: "endpoint_availability",
    status: availability.ok ? "pass" : "fail",
    latency_ms: availability.latency_ms,
    evidence: {
      http_status: availability.status,
      method,
      error: availability.error,
      pinned: true,
      note: "API availability requires HTTP 2xx/3xx on the public verification probe",
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

  results.push({
    check_type: "error_rate",
    status: availability.ok ? "pass" : "fail",
    latency_ms: availability.latency_ms,
    evidence: {
      probe_ok: availability.ok,
      http_status: availability.status,
      note: "v1 probe; production rate uses invocation telemetry",
    },
  })

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

  return results
}

function isTlsErrorMessage(message: string): boolean {
  return /certificate|CERT_|SSL|TLS|UNABLE_TO_VERIFY|handshake/i.test(message)
}

export function isSecurityIsolationFailure(results: CheckResult[]): boolean {
  const tls = checkOf(results, "tls_security")
  return tls?.status === "fail"
}

const BASE_BACKOFF_MS = 5 * 60_000
const MAX_BACKOFF_MS = 24 * 60 * 60_000
const DEFAULT_LEASE_MS = 5 * 60_000

export function nextVerifyBackoffMs(failCount: number): number {
  const exp = Math.min(failCount, 8)
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exp)
}

export async function verifyTool(
  store: CatalogStore,
  toolId: string
): Promise<CheckResult[]> {
  const tool = await store.getToolById(toolId)
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
    await store.completeVerificationAttempt(toolId, {
      success: false,
    })
    if (tool && (tool.status === "active" || tool.status === "degraded")) {
      await store.setToolStatus(toolId, "suspended")
    }
    return [missing]
  }

  const contract = (tool?.metadata?.verification ?? null) as {
    health_url?: string
    verification_url?: string
    expected_method?: "GET" | "HEAD" | "POST"
  } | null

  const probeUrl =
    contract?.verification_url || contract?.health_url || endpoint.url
  const probeMethod = contract?.expected_method

  const results = await runChecksForEndpoint({
    url: probeUrl,
    transport: endpoint.transport,
    probeMethod,
  })
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

  const admitted = meetsActivationCriteria({
    providerVerified: Boolean(tool?.provider.verified),
    transport: endpoint.transport,
    results,
  })
  const securityFail = isSecurityIsolationFailure(results)

  const schedule = await store.completeVerificationAttempt(toolId, {
    success: admitted && !securityFail,
  })

  if (tool) {
    const nextStatus = nextLifecycleStatus({
      current: tool.status,
      admitted: admitted && !securityFail,
      securityFail,
      failCount: schedule.failCount,
      successStreak: schedule.successStreak,
    })
    if (nextStatus !== tool.status) {
      await store.setToolStatus(toolId, nextStatus)
    }
  }

  await refreshTrustForTool(store, toolId)
  return results
}

export type VerificationWorkerOptions = {
  store: CatalogStore
  intervalMs: number
  batchSize: number
  enabled: boolean
  leaseMs?: number
  log?: (message: string, data?: Record<string, unknown>) => void
}

export function startVerificationWorker(
  options: VerificationWorkerOptions
): { stop: () => void } {
  if (!options.enabled) {
    return { stop: () => undefined }
  }

  let stopped = false
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
  const inFlight = new Set<string>()

  const tick = async () => {
    if (stopped) return
    try {
      const ids = await options.store.claimToolsForVerification(
        options.batchSize,
        leaseMs
      )
      const fresh = ids.filter((id) => !inFlight.has(id))
      for (const id of fresh) {
        if (stopped) break
        inFlight.add(id)
        try {
          await verifyTool(options.store, id)
        } finally {
          inFlight.delete(id)
        }
      }
      options.log?.("verification_worker_tick", {
        claimed: ids.length,
        verified: fresh.length,
      })
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
