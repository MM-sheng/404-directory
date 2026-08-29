import { createHash, randomUUID } from "node:crypto"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import { PostgresCatalogStore } from "../src/domain/postgres-store.js"
import { openDatabase } from "../src/db/client.js"
import type { CatalogStore } from "../src/domain/store.js"
import { buildApp } from "../src/http/app.js"
import { loadConfig } from "../src/config.js"
import { ToolRegistry } from "../src/tools/registry.js"
import { predictionRecord, riskRecord } from "./fixtures/evaluation-records.js"

async function seedEvaluations(store: CatalogStore, createdAt: string) {
  const suffix = randomUUID()
  const tool = await store.ensureTool(
    {
      name: `metrics_fixture_${suffix}`,
      description: "Metrics regression fixture only",
      capabilities: ["test"],
      protocol: "api",
      endpoint: "https://example.com",
      version: "1",
      authentication: "none",
      provider: {
        name: "Metrics fixture",
        slug: `metrics-${suffix}`,
        identity: { type: "domain", value: "example.com" },
      },
    },
    { status: "active", providerVerified: true }
  )
  const identities = [
    {
      is_external: false,
      agent_identity_kind: "internal" as const,
      agent_key: `a1_internal_${suffix}`,
    },
    {
      is_external: true,
      agent_identity_kind: "anonymous" as const,
      agent_key: null,
    },
    {
      is_external: true,
      agent_identity_kind: "explicit" as const,
      agent_key: `a1_external_${suffix}`,
    },
    {
      is_external: true,
      agent_identity_kind: "explicit" as const,
      agent_key: `a1_external_${suffix}`,
    },
  ]
  const entries = []
  for (const identity of identities) {
    const token = randomUUID()
    const hash = createHash("sha256").update(token).digest("hex")
    const risk = riskRecord({
      ...identity,
      target_tool_id: tool.id,
      created_at: createdAt,
      outcome_token_hash: hash,
    })
    risk.target.id = tool.id
    const prediction = predictionRecord({
      ...identity,
      created_at: createdAt,
      outcome_token_hash: hash,
    })
    await store.recordRiskEvaluation(risk)
    await store.recordPredictionMarketEvaluation(prediction)
    entries.push({ risk, prediction, token })
  }
  return entries
}

describe("risk attribution through HTTP and persistent stores", () => {
  it("keeps outcomes in their original cohort even when reporter headers change or replay", async () => {
    const store = new MemoryCatalogStore()
    const entries = await seedEvaluations(store, new Date().toISOString())
    const app = await buildApp(
      new ToolRegistry(),
      loadConfig({
        REGISTRY_ADMIN_TOKEN: "local-metrics-test-admin-only",
        AGENT_ANALYTICS_SALT: "local-metrics-test-salt-only",
      }),
      store
    )
    try {
      for (const index of [0, 2]) {
        const entry = entries[index]
        // Report an internal receipt as external and an external receipt as internal.
        const headers =
          index === 0
            ? { "x-404-agent-id": "external-reporter-00001" }
            : { "x-404-agent-class": "internal" }
        for (const request of [
          {
            url: `/v1/evaluations/${entry.risk.id}/outcome`,
            payload: {
              outcome_token: entry.token,
              action_taken: "aborted",
              result: "not_executed",
            },
          },
          {
            url: `/v1/prediction-markets/evaluations/${entry.prediction.id}/outcome`,
            payload: {
              outcome_token: entry.token,
              action_taken: "aborted",
              execution_result: "not_executed",
            },
          },
        ]) {
          for (const status of ["recorded", "already_reported"]) {
            const response = await app.inject({
              method: "POST",
              ...request,
              headers,
            })
            expect(response.statusCode).toBe(200)
            expect(response.json().status).toBe(status)
          }
        }
      }
      for (const path of [
        "risk-evaluations",
        "prediction-market-evaluations",
      ]) {
        const response = await app.inject({
          method: "GET",
          url: `/v1/metrics/${path}`,
        })
        expect(response.statusCode).toBe(200)
        expect(response.headers["cache-control"]).toBe("no-store")
        expect(response.json()).toMatchObject({
          evaluations: 4,
          external_evaluations: 3,
          reported_outcomes: 2,
          behavior_changes: 2,
          scopes: {
            internal: {
              evaluations: 1,
              reported_outcomes: 1,
              behavior_changes: 1,
            },
            external: {
              evaluations: 3,
              reported_outcomes: 1,
              behavior_changes: 1,
            },
            identified_external: {
              evaluations: 2,
              identified_external_agents: 1,
              reported_outcomes: 1,
              behavior_changes: 1,
            },
            anonymous_external: {
              evaluations: 1,
              reported_outcomes: 0,
              behavior_changes: 0,
            },
          },
        })
        for (const entry of entries) {
          for (const secret of [
            entry.token,
            entry.risk.id,
            entry.risk.outcome_token_hash,
            entry.risk.agent_key,
          ]) {
            if (secret) expect(response.body).not.toContain(secret)
          }
        }
      }
      const dashboard = await app.inject({ method: "GET", url: "/metrics" })
      expect(dashboard.statusCode).toBe(200)
      expect(
        dashboard.body.match(/data-scope="identified_external"/g)
      ).toHaveLength(2)
      expect(dashboard.body.match(/data-scope="internal"/g)).toHaveLength(2)
      expect(dashboard.body).toContain("All traffic (not adoption)")
      expect(dashboard.body).not.toContain("Qualified Agents")
      expect(dashboard.body).not.toContain(entries[0].token)

      // Run the real CLI against this local fixture server, never production.
      const baseUrl = await app.listen({ host: "127.0.0.1", port: 0 })
      const output = await promisify(execFile)(
        process.execPath,
        ["--import", "tsx", "scripts/pilot-status.ts"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            PILOT_BASE_URL: baseUrl,
            PILOT_BASELINE_AGENTS: "0",
          },
          timeout: 10_000,
        }
      )
      const report = JSON.parse(output.stdout)
      expect(report.prediction_market).toMatchObject({
        status: "available",
        scope: "identified_external",
        evaluations: 2,
        behavior_changes: 1,
        total_evaluations: 4,
        internal_evaluations: 1,
      })
      expect(report.pilot.first_success_gate_met).toBeNull()
      expect(report.pilot.verified_pilot_operators).toBeNull()
      expect(report).toHaveProperty(
        "identified_usage.repeat_installations_on_later_day"
      )
      expect(report).not.toHaveProperty("qualified_usage")
    } finally {
      await app.close()
    }
  })

  it.skipIf(!process.env.DATABASE_URL)(
    "matches memory and PostgreSQL scoped summaries, with idempotent outcomes",
    async () => {
      const handle = openDatabase(process.env.DATABASE_URL)!
      const postgres = new PostgresCatalogStore(handle.db)
      const memory = new MemoryCatalogStore()
      const since = new Date()
      try {
        const entries = await seedEvaluations(postgres, since.toISOString())
        for (const entry of entries) {
          await memory.recordRiskEvaluation(entry.risk)
          await memory.recordPredictionMarketEvaluation(entry.prediction)
        }
        for (const index of [0, 2]) {
          const entry = entries[index]
          for (const store of [memory, postgres]) {
            for (const status of ["recorded", "already_reported"]) {
              expect(
                await store.recordRiskEvaluationOutcome({
                  id: entry.risk.id,
                  outcome_token_hash: entry.risk.outcome_token_hash,
                  reported_at: since.toISOString(),
                  outcome: {
                    action_taken: "aborted",
                    result: "not_executed",
                    error_type: null,
                    evidence_level: "self_reported",
                  },
                })
              ).toBe(status)
              expect(
                await store.recordPredictionMarketEvaluationOutcome({
                  id: entry.prediction.id,
                  outcome_token_hash: entry.prediction.outcome_token_hash,
                  reported_at: since.toISOString(),
                  outcome: {
                    action_taken: "waited",
                    execution_result: "not_executed",
                    failure_type: null,
                    evidence_level: "self_reported",
                  },
                })
              ).toBe(status)
            }
          }
        }
        for (const method of [
          "riskEvaluationSummary",
          "predictionMarketEvaluationSummary",
        ] as const) {
          const persistent = await postgres[method](since)
          const inMemory = await memory[method](since)
          expect(persistent).toEqual({
            ...inMemory,
            generated_at: persistent.generated_at,
          })
          expect(persistent.scopes.internal.behavior_changes).toBe(1)
          expect(persistent.scopes.external.behavior_changes).toBe(1)
          expect(
            persistent.scopes.identified_external.identified_external_agents
          ).toBe(1)
          expect(persistent.qualified_pilot.verified_operators).toBeNull()
        }
      } finally {
        await handle.close()
      }
    }
  )
})
