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
      sources: [
        {
          source: "codex",
          identified_agents: 1,
          successful_invocations: 2,
        },
      ],
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
        events: 2,
        identified_agents: 1,
        anonymous_external_events: 0,
      },
      {
        stage: "tools_list",
        events: 2,
        identified_agents: 1,
        anonymous_external_events: 0,
      },
      {
        stage: "successful_tool",
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
          initialized_agents: 1,
          tools_listed_agents: 1,
          successful_agents: 1,
        }),
      ])
    )
  })
})
