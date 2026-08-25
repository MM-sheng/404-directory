import type {
  PredictionMarketEvaluationRecord,
  PredictionMarketEvaluationSummary,
} from "./store.js"

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
  const external = scoped.filter((record) => record.is_external)
  const externalAgents = new Set(
    external
      .filter(
        (record) =>
          record.agent_identity_kind === "explicit" && record.agent_key
      )
      .map((record) => record.agent_key!)
  )
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
    metric: "privacy_safe_prediction_market_preflight",
    generated_at: new Date().toISOString(),
    evaluations: scoped.length,
    external_evaluations: external.length,
    identified_external_agents: externalAgents.size,
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
    evidence_notice:
      "Behavior outcomes are self-reported and do not prove profitability or prediction accuracy. Market resolution calibration is not included in policy v1.",
  }
}
