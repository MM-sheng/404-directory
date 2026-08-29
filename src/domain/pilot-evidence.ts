import { z } from "zod"

const count = z.number().int().nonnegative()
const rate = z.number().min(0).max(1).nullable()
const cohort = z.object({
  evaluations: count,
  identified_external_agents: count,
  reported_outcomes: count,
  outcome_report_rate: rate,
  behavior_changes: count,
  behavior_change_rate: rate,
})
const predictionMetric = z.object({
  metric_definition_version: z.literal("risk-attribution-v2"),
  scopes: z.object({
    total: cohort,
    external: cohort,
    internal: cohort,
    identified_external: cohort,
    anonymous_external: cohort,
    unattributed: cohort,
  }),
})

/** Never fall back to mixed legacy totals when a deployment lacks scoped metrics. */
export function readPilotPredictionEvidence(input: unknown) {
  const result = predictionMetric.safeParse(input)
  if (!result.success) {
    return {
      status: "unavailable" as const,
      scope: "identified_external" as const,
      evaluations: null,
      identified_external_agents: null,
      reported_outcomes: null,
      outcome_report_rate: null,
      behavior_changes: null,
      behavior_change_rate: null,
      reason:
        "The server has no valid risk-attribution-v2 breakdown. Upgrade and recheck; legacy total traffic must not be reported as external pilot evidence.",
    }
  }
  return {
    status: "available" as const,
    scope: "identified_external" as const,
    metric_definition_version: result.data.metric_definition_version,
    ...result.data.scopes.identified_external,
    all_external_evaluations: result.data.scopes.external.evaluations,
    total_evaluations: result.data.scopes.total.evaluations,
    internal_evaluations: result.data.scopes.internal.evaluations,
    anonymous_external_evaluations:
      result.data.scopes.anonymous_external.evaluations,
    unattributed_evaluations: result.data.scopes.unattributed.evaluations,
  }
}

export function pilotIdentityProgress(
  baseline: number,
  current: number,
  target: number
) {
  count.parse(baseline)
  count.parse(current)
  z.number().int().positive().parse(target)
  const gained = Math.max(0, current - baseline)
  return {
    baseline_installations: baseline,
    target_new_installations: target,
    gained_installations: gained,
    remaining_installations: Math.max(0, target - gained),
    identity_growth_threshold_met: gained >= target,
    first_success_gate_met: null,
    verified_pilot_operators: null,
    qualification_status: "manual_verification_required" as const,
  }
}
