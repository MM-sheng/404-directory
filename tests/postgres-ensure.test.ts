import { describe, expect, it } from "vitest"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import { PostgresCatalogStore } from "../src/domain/postgres-store.js"
import { openDatabase } from "../src/db/client.js"

/**
 * Real Postgres integration — requires DATABASE_URL (set in CI).
 * Catches ensureTool version uniqueness / isLatest races that memory misses.
 */
describe("postgres ensureTool idempotency", () => {
  const url = process.env.DATABASE_URL

  it("requires DATABASE_URL when running under CI", () => {
    if (process.env.CI === "true") {
      expect(
        url,
        "CI must provide DATABASE_URL for Postgres tests"
      ).toBeTruthy()
    }
  })

  it.skipIf(!url)("re-seeding the same version does not throw", async () => {
    const handle = openDatabase(url)
    expect(handle).not.toBeNull()
    const store = new PostgresCatalogStore(handle!.db)

    const input = {
      name: `idempotent_tool_${Date.now()}`,
      description: "Idempotent seed regression fixture for postgres",
      capabilities: ["idempotency"],
      protocol: "api" as const,
      endpoint: "https://example.com/idempotent",
      version: "1.0.0",
      authentication: "none" as const,
      provider: {
        name: "Idempotent Provider",
        slug: `idempotent-prov-${Date.now()}`,
        identity: { type: "domain" as const, value: "example.com" },
      },
    }

    const first = await store.ensureTool(input, {
      status: "active",
      providerVerified: true,
    })
    const second = await store.ensureTool(input, {
      status: "active",
      providerVerified: true,
    })

    expect(second.id).toBe(first.id)
    expect(second.version).toBe("1.0.0")
    await handle!.close()
  })

  it.skipIf(!url)(
    "has the HMAC-only session correlation column after migrations",
    async () => {
      const handle = openDatabase(url)
      expect(handle).not.toBeNull()
      const columns = await handle!.sql<
        Array<{ column_name: string }>
      >`select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'invocations'
          and column_name = 'session_key'`

      expect(columns).toEqual([{ column_name: "session_key" }])
      await handle!.close()
    }
  )

  it.skipIf(!url)(
    "has the contextual risk preflight table after migrations",
    async () => {
      const handle = openDatabase(url)
      expect(handle).not.toBeNull()
      const columns = await handle!.sql<Array<{ column_name: string }>>`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'risk_evaluations'
          and column_name in ('policy_version', 'outcome_token_hash', 'outcome')
        order by column_name
      `

      expect(columns).toEqual([
        { column_name: "outcome" },
        { column_name: "outcome_token_hash" },
        { column_name: "policy_version" },
      ])
      await handle!.close()
    }
  )

  it.skipIf(!url)(
    "has the prediction-market preflight table after migrations",
    async () => {
      const handle = openDatabase(url)
      expect(handle).not.toBeNull()
      const columns = await handle!.sql<Array<{ column_name: string }>>`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'prediction_market_evaluations'
          and column_name in (
            'market_snapshot',
            'outcome_token_hash',
            'risk_score',
            'snapshot_hash'
          )
        order by column_name
      `

      expect(columns).toEqual([
        { column_name: "market_snapshot" },
        { column_name: "outcome_token_hash" },
        { column_name: "risk_score" },
        { column_name: "snapshot_hash" },
      ])
      await handle!.close()
    }
  )

  it.skipIf(!url)(
    "aggregates qualified clients and provider reliability",
    async () => {
      const handle = openDatabase(url)
      expect(handle).not.toBeNull()
      const store = new PostgresCatalogStore(handle!.db)
      const suffix = Date.now().toString()
      const metricSource = `postgres-test-${suffix}`
      const metricClient = `${metricSource}-client`
      const since = new Date(Date.now() - 60_000)
      // A database can be reused across runs. Verify this run's increment,
      // rather than assuming there are no earlier events in the window.
      const before = await store.activationFunnelSummary(since)
      const priorAttempts = before.stages.find(
        (stage) => stage.stage === "tool_attempt"
      )
      const tool = await store.ensureTool(
        {
          name: `metric_tool_${suffix}`,
          description: "Postgres reliability aggregation fixture tool",
          capabilities: ["reliability"],
          protocol: "api",
          endpoint: "https://example.com/metric",
          version: "1.0.0",
          authentication: "none",
          provider: {
            name: "Metric Provider",
            slug: `metric-provider-${suffix}`,
            identity: { type: "domain", value: "example.com" },
          },
        },
        { status: "active", providerVerified: true }
      )

      await store.recordInvocation({
        tool_id: tool.id,
        tool_name: tool.name,
        version: tool.version,
        source: "mcp",
        success: true,
        latency_ms: 42,
        agent_key: `a1_postgres_${suffix}`,
        agent_identity_kind: "explicit",
        client_name: metricClient,
        attribution_source: metricSource,
        is_external: true,
        result_count: 2,
      })
      await store.recordActivationEvent({
        stage: "mcp_initialize",
        source: metricSource,
        client: metricClient,
        agent_key: `a1_postgres_${suffix}`,
        agent_identity_kind: "explicit",
        is_external: true,
      })
      await store.recordActivationEvent({
        stage: "prompt_get",
        source: metricSource,
        client: metricClient,
        agent_key: `a1_postgres_${suffix}`,
        agent_identity_kind: "explicit",
        is_external: true,
      })

      const agents = await store.agentUsageSummary(since)
      expect(agents.clients).toContainEqual({
        client: metricClient,
        identified_agents: 1,
        successful_invocations: 1,
      })

      const activation = await store.activationFunnelSummary(since)
      expect(activation.stages).toContainEqual({
        stage: "tool_attempt",
        events: (priorAttempts?.events ?? 0) + 1,
        identified_agents: (priorAttempts?.identified_agents ?? 0) + 1,
        anonymous_external_events:
          priorAttempts?.anonymous_external_events ?? 0,
      })
      expect(activation.sources).toContainEqual(
        expect.objectContaining({
          source: metricSource,
          initialized_agents: 1,
          prompt_get_events: 1,
          prompt_get_agents: 1,
          prompt_activated_agents: 1,
          tool_call_events: 1,
          tool_call_agents: 1,
          failed_invocations: 0,
          successful_invocations: 1,
          tool_call_rate: 1,
          tool_success_rate: 1,
          prompt_activation_rate: 1,
          activation_rate: 1,
        })
      )

      const reliability = await store.reliabilitySummary(since)
      expect(reliability.providers).toContainEqual(
        expect.objectContaining({
          provider_slug: `metric-provider-${suffix}`,
          invocations: 1,
          successes: 1,
          identified_agents: 1,
        })
      )
      await handle!.close()
    }
  )

  it("memory ensureTool remains idempotent for same version", async () => {
    const store = new MemoryCatalogStore()
    const input = {
      name: "mem_idempotent",
      description: "Memory idempotent seed fixture tool",
      capabilities: ["idempotency"],
      protocol: "api" as const,
      endpoint: "https://example.com/mem",
      version: "1.0.0",
      authentication: "none" as const,
      provider: {
        name: "Mem",
        slug: "mem-prov",
        identity: { type: "domain" as const, value: "example.com" },
      },
    }
    const first = await store.ensureTool(input, { status: "active" })
    const second = await store.ensureTool(input, { status: "active" })
    expect(second.id).toBe(first.id)
  })
})
