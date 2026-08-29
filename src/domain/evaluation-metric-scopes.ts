/** Attribution is evidence about an installation, never operator identity. */
export type EvaluationAttribution = {
  is_external?: boolean | null
  agent_identity_kind?: string | null
  agent_key?: string | null
}

export type EvaluationCohort =
  "internal" | "anonymous_external" | "identified_external" | "unattributed"

export type EvaluationMetricScopes<T> = Record<
  EvaluationCohort | "total" | "external",
  T
>

export type EvaluationMetricAttribution<T> = {
  metric_definition_version: "risk-attribution-v2"
  legacy_aggregate_scope: "total"
  cohort_basis: "evaluation_created_at"
  scopes: EvaluationMetricScopes<T>
  qualified_pilot: {
    status: "not_measured"
    verified_operators: null
    reason: string
  }
  scope_notice: string
}

export function evaluationCohort(
  record: EvaluationAttribution
): EvaluationCohort {
  // An internal marker always wins, even if an inconsistent legacy flag says external.
  if (
    record.is_external === false ||
    record.agent_identity_kind === "internal"
  ) {
    return "internal"
  }
  if (record.is_external !== true) return "unattributed"
  if (record.agent_identity_kind === "anonymous") return "anonymous_external"
  if (
    record.agent_identity_kind === "explicit" &&
    typeof record.agent_key === "string" &&
    record.agent_key.trim().length > 0
  )
    return "identified_external"
  // Never promote missing/unknown identity metadata to a verified installation.
  return "unattributed"
}

export function countIdentifiedExternalAgents(
  records: EvaluationAttribution[]
): number {
  return new Set(
    records
      .filter((record) => evaluationCohort(record) === "identified_external")
      .map((record) => record.agent_key!)
  ).size
}

export function buildEvaluationAttribution<R extends EvaluationAttribution, S>(
  records: R[],
  summarize: (records: R[]) => S
): EvaluationMetricAttribution<S> {
  const groups: Record<EvaluationCohort, R[]> = {
    internal: [],
    anonymous_external: [],
    identified_external: [],
    unattributed: [],
  }
  for (const record of records) groups[evaluationCohort(record)].push(record)
  return {
    metric_definition_version: "risk-attribution-v2",
    legacy_aggregate_scope: "total",
    cohort_basis: "evaluation_created_at",
    scopes: {
      total: summarize(records),
      external: summarize([
        ...groups.anonymous_external,
        ...groups.identified_external,
      ]),
      internal: summarize(groups.internal),
      anonymous_external: summarize(groups.anonymous_external),
      identified_external: summarize(groups.identified_external),
      unattributed: summarize(groups.unattributed),
    },
    qualified_pilot: {
      status: "not_measured",
      verified_operators: null,
      reason:
        "Independent operator admission and real-task repeat use require a separate verified pilot record. IDs and source labels alone cannot establish this.",
    },
    scope_notice:
      "Legacy top-level aggregates include all traffic. Use scopes.external or scopes.identified_external for external-use evidence. total = internal + anonymous_external + identified_external + unattributed; external = anonymous_external + identified_external. Outcomes inherit the evaluation attribution, not the reporter headers. internal includes records marked non-external. Missing attribution is not evidence of an external user. Counts are installations, not verified people, and self-reports are not causal proof of value.",
  }
}
