import { describe, expect, it } from "vitest"
import {
  pilotIdentityProgress,
  readPilotPredictionEvidence,
} from "../src/domain/pilot-evidence.js"
import { buildPredictionMarketEvaluationSummary } from "../src/domain/prediction-market-metrics.js"
import { predictionRecord } from "./fixtures/evaluation-records.js"

describe("honest pilot evidence", () => {
  it("does not fall back to old mixed totals or fabricate zeros", () => {
    for (const input of [
      null,
      {},
      {
        evaluations: 1000,
        behavior_changes: 100,
        identified_external_agents: 10,
      },
      { metric_definition_version: "risk-attribution-v2", scopes: {} },
    ]) {
      expect(readPilotPredictionEvidence(input)).toMatchObject({
        status: "unavailable",
        evaluations: null,
        behavior_changes: null,
      })
    }
  })

  it("uses only the identified external scope for pilot task outcomes", () => {
    const changed = {
      action_taken: "aborted",
      execution_result: "not_executed",
      failure_type: null,
      evidence_level: "self_reported",
    } as const
    const summary = buildPredictionMarketEvaluationSummary([
      predictionRecord({ is_external: false, outcome: changed }),
      predictionRecord({
        agent_identity_kind: "anonymous",
        agent_key: null,
        outcome: changed,
      }),
      predictionRecord(),
    ])
    expect(readPilotPredictionEvidence(summary)).toMatchObject({
      status: "available",
      scope: "identified_external",
      evaluations: 1,
      identified_external_agents: 1,
      reported_outcomes: 0,
      behavior_changes: 0,
      behavior_change_rate: null,
      total_evaluations: 3,
      internal_evaluations: 1,
      anonymous_external_evaluations: 1,
    })
  })

  it("does not claim independent operators when the identity growth goal is met", () => {
    expect(pilotIdentityProgress(2, 12, 10)).toMatchObject({
      gained_installations: 10,
      identity_growth_threshold_met: true,
      first_success_gate_met: null,
      verified_pilot_operators: null,
      qualification_status: "manual_verification_required",
    })
    expect(pilotIdentityProgress(2, 1, 10).gained_installations).toBe(0)
    expect(() => pilotIdentityProgress(0, NaN, 10)).toThrow()
  })
})
