import type {
  PredictionMarketEvaluationRecord,
  PredictionMarketEvaluationSummary,
  PredictionMarketEvaluationCohortSummary,
} from "./store.js"
import {
  buildEvaluationAttribution,
  countIdentifiedExternalAgents,
} from "./evaluation-metric-scopes.js"

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(4))
}

export function buildPredictionMarketEvaluationSummary(
  records: PredictionMarketEvaluationRecord[],
  since = new Date("2026-01-01T00:00:00.000Z")
): PredictionMarketEvaluationSummary {
  const scoped = records.filter(
    (record) => new Date(record.created_at).getTime() >= since.getTime()
  )
  const attribution = buildEvaluationAttribution(
    scoped,
    summarizePredictionCohort
  )
  return {
    metric: "privacy_safe_prediction_market_preflight",
    window_start: since.toISOString(),
    generated_at: new Date().toISOString(),
    ...attribution.scopes.total,
    external_evaluations: attribution.scopes.external.evaluations,
    ...attribution,
    evidence_notice:
      "Behavior outcomes are self-reported and do not prove causation, independent users, prevented losses, profitability, or prediction accuracy. Market resolution calibration is not included. Self-reported outcomes do not directly increase Trust scores.",
  }
}

function summarizePredictionCohort(
  scoped: PredictionMarketEvaluationRecord[]
): PredictionMarketEvaluationCohortSummary {
  const reported = scoped.filter((record) => record.outcome)
  const behaviorChanges = reported.filter((record) =>
    [
      "reduced_position",
      "changed_side",
      "waited",
      "requested_review",
      "aborted",
    ].includes(record.outcome!.action_taken)
  ).length
  const reasons = new Map<string, number>()
  for (const record of scoped) {
    for (const code of new Set(record.reason_codes)) {
      reasons.set(code, (reasons.get(code) ?? 0) + 1)
    }
  }

  return {
    evaluations: scoped.length,
    identified_external_agents: countIdentifiedExternalAgents(scoped),
    decisions: {
      allow: scoped.filter((record) => record.decision === "allow").length,
      review: scoped.filter((record) => record.decision === "review").length,
      block: scoped.filter((record) => record.decision === "block").length,
    },
    reported_outcomes: reported.length,
    outcome_report_rate: ratio(reported.length, scoped.length),
    behavior_changes: behaviorChanges,
    behavior_change_rate: ratio(behaviorChanges, reported.length),
    top_reason_codes: [...reasons.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([reason_code, evaluations]) => ({ reason_code, evaluations })),
  }
}
