import { describe, expect, it } from "vitest"
import { buildRiskEvaluationSummary } from "../src/domain/risk-metrics.js"
import { buildPredictionMarketEvaluationSummary } from "../src/domain/prediction-market-metrics.js"
import { evaluationCohort } from "../src/domain/evaluation-metric-scopes.js"
import { predictionRecord, riskRecord } from "./fixtures/evaluation-records.js"
import type {
  RiskEvaluationRecord,
  RiskEvaluationSummary,
  PredictionMarketEvaluationSummary,
} from "../src/domain/store.js"

const changedRisk = {
  action_taken: "aborted",
  result: "not_executed",
  error_type: null,
  evidence_level: "self_reported",
} as const
const changedPrediction = {
  action_taken: "aborted",
  execution_result: "not_executed",
  failure_type: null,
  evidence_level: "self_reported",
} as const
type FixtureOptions = Partial<
  Pick<
    RiskEvaluationRecord,
    | "is_external"
    | "agent_identity_kind"
    | "agent_key"
    | "decision"
    | "attribution_source"
    | "created_at"
    | "outcome_reported_at"
  >
> & { changed?: boolean }

function metricSuite<R extends { id: string; outcome_token_hash: string }>(
  name: string,
  record: (options: FixtureOptions) => R,
  summarize: (
    records: R[],
    since?: Date
  ) => RiskEvaluationSummary | PredictionMarketEvaluationSummary
) {
  describe(`${name} attribution aggregates`, () => {
    it("partitions totals, deduplicates only identified keys, and keeps test behavior out of external evidence", () => {
      const records = [
        record({
          is_external: false,
          agent_identity_kind: "internal",
          changed: true,
        }),
        record({
          is_external: true,
          agent_identity_kind: "anonymous",
          agent_key: null,
          decision: "allow",
        }),
        record({ changed: true }),
        record({ decision: "allow" }), // same identity, new evaluation
        record({ agent_key: null, changed: true }), // invalid explicit identity
      ]
      const frozen = structuredClone(records)
      const result = summarize(records)
      expect(result).toMatchObject({
        metric_definition_version: "risk-attribution-v2",
        legacy_aggregate_scope: "total",
        cohort_basis: "evaluation_created_at",
        evaluations: 5,
        external_evaluations: 3,
        identified_external_agents: 1,
        reported_outcomes: 3,
        behavior_changes: 3,
      })
      expect(result.scopes.internal).toMatchObject({
        evaluations: 1,
        behavior_changes: 1,
        identified_external_agents: 0,
      })
      expect(result.scopes.anonymous_external).toMatchObject({
        evaluations: 1,
        reported_outcomes: 0,
        behavior_changes: 0,
        behavior_change_rate: null,
        identified_external_agents: 0,
      })
      expect(result.scopes.identified_external).toMatchObject({
        evaluations: 2,
        reported_outcomes: 1,
        outcome_report_rate: 0.5,
        behavior_changes: 1,
        behavior_change_rate: 1,
        identified_external_agents: 1,
      })
      expect(result.scopes.external).toMatchObject({
        evaluations: 3,
        behavior_changes: 1,
      })
      expect(result.scopes.unattributed).toMatchObject({
        evaluations: 1,
        behavior_changes: 1,
        identified_external_agents: 0,
      })
      expect(result.qualified_pilot).toMatchObject({
        status: "not_measured",
        verified_operators: null,
      })
      expect(result.scopes.total.evaluations).toBe(
        (
          [
            "internal",
            "anonymous_external",
            "identified_external",
            "unattributed",
          ] as const
        ).reduce((sum, name) => sum + result.scopes[name].evaluations, 0)
      )
      expect(JSON.stringify(result)).not.toContain("a1_fixture_agent")
      expect(JSON.stringify(result)).not.toContain(
        records[0].outcome_token_hash
      )
      expect(JSON.stringify(result)).not.toContain(records[0].id)
      expect(records).toEqual(frozen)
    })

    it("does not turn internal-only or empty evidence into external success or pilot progress", () => {
      for (const records of [
        [],
        [
          record({
            is_external: false,
            changed: true,
            attribution_source: "qualified-pilot",
          }),
        ],
      ]) {
        const result = summarize(records)
        expect(result.scopes.external).toMatchObject({
          evaluations: 0,
          reported_outcomes: 0,
          outcome_report_rate: null,
          behavior_changes: 0,
          behavior_change_rate: null,
        })
        expect(result.qualified_pilot.verified_operators).toBeNull()
      }
    })

    it("uses the evaluation cohort window, not the date of a later report", () => {
      const since = new Date("2026-08-27T10:00:00.000Z")
      const result = summarize(
        [
          record({
            created_at: "2026-08-27T09:59:59.999Z",
            changed: true,
            outcome_reported_at: "2026-08-28T00:00:00.000Z",
          }),
          record({ created_at: since.toISOString() }),
        ],
        since
      )
      expect(result).toMatchObject({
        window_start: since.toISOString(),
        evaluations: 1,
        reported_outcomes: 0,
      })
    })
  })
}

metricSuite(
  "tool risk",
  ({ changed, ...options }) =>
    riskRecord({ ...options, outcome: changed ? changedRisk : null }),
  buildRiskEvaluationSummary
)
metricSuite(
  "prediction market",
  ({ changed, ...options }) =>
    predictionRecord({
      ...options,
      outcome: changed ? changedPrediction : null,
    }),
  buildPredictionMarketEvaluationSummary
)

describe("conservative evaluation attribution", () => {
  it("keeps internal policies and action/result distributions out of the external scope", () => {
    const result = buildRiskEvaluationSummary([
      riskRecord({
        is_external: false,
        policy_version: "internal-policy",
        outcome: changedRisk,
      }),
      riskRecord({ policy_version: "external-policy" }),
    ])
    expect(result.scopes.identified_external.policies).toEqual([
      { policy_version: "external-policy", evaluations: 1 },
    ])
    expect(result.scopes.internal.actions.aborted).toBe(1)
    expect(result.scopes.identified_external.actions.aborted).toBe(0)
    expect(result.scopes.identified_external.results.not_executed).toBe(0)
  })

  it("keeps internal reason codes out of the external prediction scope and deduplicates per receipt", () => {
    const result = buildPredictionMarketEvaluationSummary([
      predictionRecord({ is_external: false, reason_codes: ["INTERNAL_ONLY"] }),
      predictionRecord({
        reason_codes: ["EXTERNAL_REASON", "EXTERNAL_REASON"],
      }),
    ])
    expect(result.scopes.identified_external.top_reason_codes).toEqual([
      { reason_code: "EXTERNAL_REASON", evaluations: 1 },
    ])
    expect(result.scopes.internal.top_reason_codes).toEqual([
      { reason_code: "INTERNAL_ONLY", evaluations: 1 },
    ])
  })

  it.each([
    [
      { is_external: true, agent_identity_kind: "internal", agent_key: "key" },
      "internal",
    ],
    [
      { is_external: false, agent_identity_kind: "explicit", agent_key: "key" },
      "internal",
    ],
    [
      { is_external: true, agent_identity_kind: "anonymous", agent_key: "key" },
      "anonymous_external",
    ],
    [
      { is_external: true, agent_identity_kind: "explicit", agent_key: " " },
      "unattributed",
    ],
    [
      { is_external: true, agent_identity_kind: "other", agent_key: "key" },
      "unattributed",
    ],
    [{ agent_identity_kind: "explicit", agent_key: "key" }, "unattributed"],
    [{}, "unattributed"],
  ])(
    "does not promote incomplete or conflicting identity metadata",
    (record, cohort) => {
      expect(evaluationCohort(record)).toBe(cohort)
    }
  )
})
