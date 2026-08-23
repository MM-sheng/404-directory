import { describe, expect, it } from "vitest"
import {
  buildAgentRetention,
  buildReliabilitySummary,
  type InvocationMetricRow,
} from "../src/domain/metrics.js"
import {
  classifyErrorType,
  normalizeErrorType,
} from "../src/domain/telemetry.js"

function row(
  createdAt: string,
  overrides: Partial<InvocationMetricRow> = {}
): InvocationMetricRow {
  return {
    tool_name: "search_official_docs",
    version: "0.9.2",
    provider_slug: "microsoft",
    provider_name: "Microsoft Learn",
    success: true,
    latency_ms: 100,
    agent_key: "a1_one",
    agent_identity_kind: "explicit",
    client_name: "cursor",
    attribution_source: "cursor-marketplace",
    is_external: true,
    result_count: 2,
    created_at: createdAt,
    ...overrides,
  }
}

describe("privacy-safe Agent metrics", () => {
  it("measures 7/30-day retention only after a complete observation window", () => {
    const now = new Date("2026-08-02T12:00:00.000Z")
    const retention = buildAgentRetention(
      [
        row("2026-07-01T10:00:00.000Z"),
        row("2026-07-03T11:00:00.000Z"),
        row("2026-07-20T10:00:00.000Z", { agent_key: "a1_two" }),
        row("2026-08-01T10:00:00.000Z", { agent_key: "a1_new" }),
        row("2026-07-02T10:00:00.000Z", {
          agent_key: null,
          agent_identity_kind: "anonymous",
        }),
        row("2026-07-02T10:00:00.000Z", {
          agent_key: "a1_internal",
          agent_identity_kind: "internal",
          is_external: false,
        }),
      ],
      now
    )

    expect(retention.repeat_agents_on_later_day).toBe(1)
    expect(retention.day_7).toEqual({
      window_days: 7,
      eligible_agents: 2,
      retained_agents: 1,
      retention_rate: 0.5,
    })
    expect(retention.day_30).toEqual({
      window_days: 30,
      eligible_agents: 1,
      retained_agents: 1,
      retention_rate: 1,
    })
  })

  it("aggregates reliability without exposing identities or counting internals", () => {
    const since = new Date("2026-08-01T00:00:00.000Z")
    const now = new Date("2026-08-03T00:00:00.000Z")
    const summary = buildReliabilitySummary(
      [
        row("2026-08-01T10:00:00.000Z", { latency_ms: 10 }),
        row("2026-08-01T11:00:00.000Z", {
          latency_ms: 90,
          success: false,
          error_type: "provider_rate_limited",
          result_count: 0,
        }),
        row("2026-08-01T12:00:00.000Z", {
          latency_ms: 30,
          agent_key: null,
          agent_identity_kind: "anonymous",
        }),
        row("2026-08-01T13:00:00.000Z", {
          agent_key: "a1_internal",
          agent_identity_kind: "internal",
          is_external: false,
        }),
      ],
      since,
      now
    )

    expect(summary.overall).toMatchObject({
      invocations: 3,
      successes: 2,
      success_rate: 0.6667,
      identified_agents: 1,
      anonymous_invocations: 1,
      result_items: 4,
      p50_latency_ms: 30,
      p95_latency_ms: 90,
    })
    expect(summary.providers[0]).toMatchObject({
      provider_slug: "microsoft",
      invocations: 3,
    })
    expect(summary.clients[0]).toMatchObject({ client: "cursor" })
    expect(summary.sources[0]).toMatchObject({
      source: "cursor-marketplace",
    })
    expect(summary.errors).toEqual([
      { error_type: "provider_rate_limited", events: 1 },
    ])
    expect(JSON.stringify(summary)).not.toContain("a1_one")
  })

  it("tolerates small database/host clock skew", () => {
    const now = new Date("2026-08-03T00:00:00.000Z")
    const summary = buildReliabilitySummary(
      [row("2026-08-03T00:00:01.000Z")],
      new Date("2026-08-02T00:00:00.000Z"),
      now
    )
    expect(summary.overall.invocations).toBe(1)
  })
})

describe("finite telemetry error taxonomy", () => {
  it("maps provider, protocol, policy, validation, and unknown failures", () => {
    expect(normalizeErrorType("remote_rate_limited")).toBe(
      "provider_rate_limited"
    )
    expect(normalizeErrorType("remote_timeout")).toBe("provider_timeout")
    expect(normalizeErrorType("unsupported_protocol")).toBe("protocol_mismatch")
    expect(normalizeErrorType("remote_tool_not_allowed")).toBe(
      "tool_not_allowed"
    )
    expect(normalizeErrorType("arguments_too_large")).toBe("invalid_arguments")
    expect(
      normalizeErrorType("sensitive user text that must not persist")
    ).toBe("unknown")

    const coded = Object.assign(new Error("temporary provider problem"), {
      code: "remote_unavailable",
    })
    expect(classifyErrorType(coded)).toBe("provider_unavailable")
  })
})
