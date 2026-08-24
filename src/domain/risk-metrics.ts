import type { RiskEvaluationRecord, RiskEvaluationSummary } from "./store.js"

export function buildRiskEvaluationSummary(
  records: RiskEvaluationRecord[],
  since = new Date("2026-01-01T00:00:00.000Z")
): RiskEvaluationSummary {
  const eligible = records.filter(
    (record) => new Date(record.created_at).getTime() >= since.getTime()
  )
  const outcomes = eligible.filter((record) => record.outcome)
  const identifiedAgents = new Set(
    eligible
      .filter(
        (record) =>
          record.is_external &&
          record.agent_identity_kind === "explicit" &&
          record.agent_key
      )
      .map((record) => record.agent_key!)
  )
  const externalEvaluations = eligible.filter(
    (record) => record.is_external
  ).length
  const decisions = { allow: 0, review: 0, block: 0 }
  const actions = {
    proceeded: 0,
    changed_tool: 0,
    requested_review: 0,
    aborted: 0,
  }
  const results = { success: 0, failure: 0, not_executed: 0, unknown: 0 }
  const policyCounts = new Map<string, number>()

  for (const record of eligible) {
    decisions[record.decision] += 1
    policyCounts.set(
      record.policy_version,
      (policyCounts.get(record.policy_version) ?? 0) + 1
    )
    if (record.outcome) {
      actions[record.outcome.action_taken] += 1
      results[record.outcome.result] += 1
    }
  }
  const behaviorChanges =
    actions.changed_tool + actions.requested_review + actions.aborted

  return {
    metric: "privacy_safe_agent_tool_risk_preflight",
    definition:
      "Contextual third-party tool evaluations and bounded outcomes. No raw Agent IDs, prompts, arguments, outputs, tokens, IPs, or personal data are included.",
    window_start: since.toISOString(),
    generated_at: new Date().toISOString(),
    evaluations: eligible.length,
    external_evaluations: externalEvaluations,
    identified_external_agents: identifiedAgents.size,
    decisions,
    reported_outcomes: outcomes.length,
    outcome_report_rate:
      eligible.length === 0 ? null : outcomes.length / eligible.length,
    actions,
    results,
    behavior_changes: behaviorChanges,
    behavior_change_rate:
      outcomes.length === 0 ? null : behaviorChanges / outcomes.length,
    policies: [...policyCounts.entries()]
      .map(([policy_version, evaluations]) => ({
        policy_version,
        evaluations,
      }))
      .sort((a, b) => b.evaluations - a.evaluations),
    evidence_notice:
      "Outcomes are self-reported unless a future receipt explicitly marks evidence_level=observed. Self-reported outcomes do not directly increase Trust scores.",
  }
}
