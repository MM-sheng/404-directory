import { afterEach, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { loadConfig } from "../src/config.js"
import {
  agentAttributionFromHeaders,
  withAgentAttribution,
} from "../src/domain/agent-attribution.js"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import { trackInvocation } from "../src/domain/telemetry.js"
import { buildApp } from "../src/http/app.js"
import { ToolRegistry } from "../src/tools/registry.js"
import type { ToolDefinition } from "../src/tools/types.js"

const salt = "test-agent-analytics-salt-32chars"

function echoRegistry(): ToolRegistry {
  const schema = z.object({ value: z.string() }).strict()
  const echo: ToolDefinition = {
    name: "echo_tool",
    description: "Echo one test value",
    use_when: "Testing Agent attribution",
    do_not_use_when: "Outside tests",
    version: "0.0.1",
    endpoint: "/echo",
    method: "POST",
    status: "active",
    read_only: true,
    side_effects: [],
    requires_auth: false,
    cost: "free",
    typical_latency_ms: 1,
    examples: [
      { description: "echo", input: { value: "a" }, output: { value: "a" } },
    ],
    inputSchema: schema,
    outputSchema: schema,
    handler: async (input) => input,
  }
  return new ToolRegistry().register(echo)
}

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe("privacy-safe Agent attribution", () => {
  it("hashes stable explicit IDs and excludes known probes", () => {
    const first = agentAttributionFromHeaders(
      {
        "x-404-agent-id": "agent:stable-random-1234",
        "x-404-source": "codex",
        "user-agent": "external-agent/1.0",
      },
      salt
    )
    const second = agentAttributionFromHeaders(
      { "X-404-Agent-ID": "agent:stable-random-1234" },
      salt
    )
    expect(first.agent_key).toBe(second.agent_key)
    expect(first.agent_key).toMatch(/^a1_[a-f0-9]{40}$/)
    expect(first.agent_key).not.toContain("stable-random")
    expect(first).toMatchObject({
      agent_identity_kind: "explicit",
      attribution_source: "codex",
      is_external: true,
    })

    expect(
      agentAttributionFromHeaders(
        {
          "x-404-agent-id": "agent:probe-stable-1234",
          "user-agent": "mcpbeat/0.1",
        },
        salt
      ).is_external
    ).toBe(false)
  })

  it("accepts an OpenAI MCP bearer installation token but not arbitrary OAuth tokens", () => {
    const attribution = agentAttributionFromHeaders(
      {
        authorization:
          "Bearer agent:0194c8a7-6c46-4a25-9d03-2f1ecb34cdb0@launch.openai-responses",
        "user-agent": "OpenAI Responses API",
      },
      salt
    )

    expect(attribution).toMatchObject({
      agent_identity_kind: "explicit",
      attribution_source: "launch.openai-responses",
      client_name: "OpenAI Responses API",
      is_external: true,
    })
    expect(attribution.agent_key).toMatch(/^a1_[a-f0-9]{40}$/)

    expect(
      agentAttributionFromHeaders(
        { authorization: "Bearer oauth-secret-that-must-not-be-attributed" },
        salt
      )
    ).toMatchObject({
      agent_key: null,
      agent_identity_kind: "anonymous",
    })
  })

  it("attributes standard MCP client hints to safe channel families", () => {
    expect(
      agentAttributionFromHeaders(
        { "user-agent": "node" },
        salt,
        "ChatGPT Connector"
      )
    ).toMatchObject({
      client_name: "ChatGPT Connector",
      attribution_source: "openai",
      agent_identity_kind: "anonymous",
      is_external: true,
    })
    expect(
      agentAttributionFromHeaders(
        {
          "x-404-source": "marketplace-campaign",
          "user-agent": "Cursor/2.0",
        },
        salt
      ).attribution_source
    ).toBe("marketplace-campaign")
    expect(
      agentAttributionFromHeaders({}, salt, "MCPBeat Scanner").is_external
    ).toBe(false)
    expect(
      agentAttributionFromHeaders(
        { "user-agent": "unrecognized-client/1.0" },
        salt
      ).attribution_source
    ).toBe("direct")
  })

  it("counts one identified external Agent only after successful execution", async () => {
    const store = new MemoryCatalogStore()
    app = await buildApp(
      echoRegistry(),
      loadConfig({ AGENT_ANALYTICS_SALT: salt }),
      store
    )
    const headers = {
      "x-404-agent-id": "agent:external-test-1234",
      "x-404-source": "codex",
      "x-404-client-name": "codex-test",
    }

    for (let index = 0; index < 2; index += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/echo",
        headers,
        payload: { value: "works" },
      })
      expect(response.statusCode).toBe(200)
    }

    const metrics = await app.inject({
      method: "GET",
      url: "/v1/metrics/agents",
    })
    expect(metrics.statusCode).toBe(200)
    expect(metrics.json()).toMatchObject({
      identified_external_agents: 1,
      successful_external_invocations: 2,
      anonymous_successful_invocations: 0,
      progress_ratio: 0.001,
      retention: {
        repeat_agents_on_later_day: 0,
        day_7: {
          eligible_agents: 0,
          retained_agents: 0,
          retention_rate: null,
        },
      },
      sources: [
        {
          source: "codex",
          identified_agents: 1,
          successful_invocations: 2,
        },
      ],
      clients: [
        {
          client: "codex-test",
          identified_agents: 1,
          successful_invocations: 2,
        },
      ],
    })

    const reliability = await app.inject({
      method: "GET",
      url: "/v1/metrics/reliability?days=30",
    })
    expect(reliability.statusCode).toBe(200)
    expect(reliability.json()).toMatchObject({
      metric: "privacy_safe_tool_provider_reliability",
      window_days: 30,
      overall: {
        invocations: 2,
        successes: 2,
        identified_agents: 1,
      },
      clients: [expect.objectContaining({ client: "codex-test" })],
      sources: [expect.objectContaining({ source: "codex" })],
    })
  })

  it("does not count anonymous or internal executions toward the target", async () => {
    const store = new MemoryCatalogStore()
    await trackInvocation(store, {
      tool_name: "anonymous_tool",
      source: "mcp",
      success: true,
      latency_ms: 1,
      is_external: true,
      agent_identity_kind: "anonymous",
    })
    await withAgentAttribution(
      agentAttributionFromHeaders(
        {
          "x-404-agent-id": "internal:release-smoke-1234",
          "x-404-agent-class": "internal",
        },
        salt
      ),
      () =>
        trackInvocation(store, {
          tool_name: "internal_tool",
          source: "mcp",
          success: true,
          latency_ms: 1,
        })
    )

    const metrics = await store.agentUsageSummary()
    expect(metrics.identified_external_agents).toBe(0)
    expect(metrics.anonymous_successful_invocations).toBe(1)
  })

  it("reports the activation funnel without counting diagnostic views as Agents", async () => {
    const store = new MemoryCatalogStore()
    const attribution = agentAttributionFromHeaders(
      {
        "x-404-agent-id": "agent:funnel-external-1234",
        "x-404-source": "cursor-marketplace.cursor",
        "x-404-client-name": "cursor",
      },
      salt
    )
    const failedAttribution = agentAttributionFromHeaders(
      {
        "x-404-agent-id": "agent:funnel-failed-5678",
        "x-404-source": "cursor-marketplace.cursor",
        "x-404-client-name": "cursor",
      },
      salt
    )

    await store.recordActivationEvent({
      stage: "connect_view",
      source: "cursor-marketplace",
      client: "web",
    })
    await store.recordActivationEvent({
      stage: "install_click",
      source: "cursor-marketplace.cursor",
      client: "cursor",
    })
    for (const stage of ["mcp_initialize", "tools_list"] as const) {
      await store.recordActivationEvent({
        stage,
        source: attribution.attribution_source!,
        client: attribution.client_name,
        agent_key: attribution.agent_key,
        agent_identity_kind: attribution.agent_identity_kind,
        is_external: attribution.is_external,
      })
      await store.recordActivationEvent({
        stage,
        source: failedAttribution.attribution_source!,
        client: failedAttribution.client_name,
        agent_key: failedAttribution.agent_key,
        agent_identity_kind: failedAttribution.agent_identity_kind,
        is_external: failedAttribution.is_external,
      })
      await store.recordActivationEvent({
        stage,
        source: attribution.attribution_source!,
        client: attribution.client_name,
        agent_key: attribution.agent_key,
        agent_identity_kind: attribution.agent_identity_kind,
        is_external: attribution.is_external,
      })
    }
    for (const stage of ["prompts_list", "prompt_get"] as const) {
      await store.recordActivationEvent({
        stage,
        source: attribution.attribution_source!,
        client: attribution.client_name,
        agent_key: attribution.agent_key,
        agent_identity_kind: attribution.agent_identity_kind,
        is_external: attribution.is_external,
      })
    }
    await trackInvocation(store, {
      tool_name: "search_official_docs",
      source: "mcp",
      success: true,
      latency_ms: 3,
      agent_key: attribution.agent_key,
      agent_identity_kind: attribution.agent_identity_kind,
      client_name: attribution.client_name,
      attribution_source: attribution.attribution_source,
      is_external: attribution.is_external,
    })
    await trackInvocation(store, {
      tool_name: "search_official_docs",
      source: "mcp",
      success: false,
      latency_ms: 5,
      error_type: "provider_timeout",
      agent_key: failedAttribution.agent_key,
      agent_identity_kind: failedAttribution.agent_identity_kind,
      client_name: failedAttribution.client_name,
      attribution_source: failedAttribution.attribution_source,
      is_external: failedAttribution.is_external,
    })

    const funnel = await store.activationFunnelSummary()
    expect(funnel.stages).toEqual([
      {
        stage: "connect_view",
        events: 1,
        identified_agents: 0,
        anonymous_external_events: 0,
      },
      {
        stage: "install_click",
        events: 1,
        identified_agents: 0,
        anonymous_external_events: 0,
      },
      {
        stage: "mcp_initialize",
        events: 3,
        identified_agents: 2,
        anonymous_external_events: 0,
      },
      {
        stage: "tools_list",
        events: 3,
        identified_agents: 2,
        anonymous_external_events: 0,
      },
      {
        stage: "prompts_list",
        events: 1,
        identified_agents: 1,
        anonymous_external_events: 0,
      },
      {
        stage: "prompt_get",
        events: 1,
        identified_agents: 1,
        anonymous_external_events: 0,
      },
      {
        stage: "tool_attempt",
        events: 2,
        identified_agents: 2,
        anonymous_external_events: 0,
      },
      {
        stage: "successful_tool",
        events: 1,
        identified_agents: 1,
        anonymous_external_events: 0,
      },
      {
        stage: "failed_tool",
        events: 1,
        identified_agents: 1,
        anonymous_external_events: 0,
      },
    ])
    expect(funnel.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "cursor-marketplace.cursor",
          install_clicks: 1,
          initialize_events: 3,
          initialized_agents: 2,
          tools_list_events: 3,
          tools_listed_agents: 2,
          prompts_list_events: 1,
          prompts_listed_agents: 1,
          prompt_get_events: 1,
          prompt_get_agents: 1,
          prompt_activated_agents: 1,
          tool_call_events: 2,
          tool_call_agents: 2,
          failed_invocations: 1,
          failed_agents: 1,
          successful_invocations: 1,
          successful_agents: 1,
          tool_call_rate: 1,
          tool_success_rate: 0.5,
          prompt_activation_rate: 1,
          activation_rate: 0.5,
        }),
      ])
    )
  })

  it("records request metadata while hashing the raw MCP session id", async () => {
    const store = new MemoryCatalogStore()
    const attribution = agentAttributionFromHeaders(
      {
        "x-404-agent-id": "agent:correlation-test-1234",
        "x-404-source": "cursor",
        "mcp-session-id": "raw-session-token-abc-123",
      },
      salt,
      "Cursor",
      {
        request_id: "req-xyz-999",
        session_id: "raw-session-token-abc-123",
      }
    )

    expect(attribution.session_key).toMatch(/^s1_[a-f0-9]{40}$/)
    expect(attribution.session_key).not.toContain("raw-session-token")

    await withAgentAttribution(attribution, () =>
      trackInvocation(store, {
        tool_name: "search_tools",
        source: "mcp",
        success: true,
        latency_ms: 12,
        result_count: 3,
      })
    )

    const recorded = (
      store as unknown as { invocations: Array<Record<string, unknown>> }
    ).invocations[0]
    expect(recorded).toMatchObject({
      request_id: "req-xyz-999",
      session_key: attribution.session_key,
      result_count: 3,
      attribution_source: "cursor",
      agent_identity_kind: "explicit",
      is_external: true,
    })
    expect(JSON.stringify(recorded)).not.toContain("raw-session-token-abc-123")
    expect(typeof recorded.started_at).toBe("string")
    expect(typeof recorded.completed_at).toBe("string")
  })
})
