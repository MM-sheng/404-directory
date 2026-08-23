export type InvocationMetricRow = {
  tool_name: string
  version?: string | null
  provider_slug?: string | null
  provider_name?: string | null
  success: boolean
  latency_ms: number
  error_type?: string | null
  agent_key?: string | null
  agent_identity_kind?: "explicit" | "anonymous" | "internal" | null
  client_name?: string | null
  attribution_source?: string | null
  is_external?: boolean
  result_count?: number | null
  created_at: Date | number | string
}

export type RetentionWindow = {
  window_days: 7 | 30
  eligible_agents: number
  retained_agents: number
  retention_rate: number | null
}

export type AgentRetentionSummary = {
  definition: string
  repeat_agents_on_later_day: number
  day_7: RetentionWindow
  day_30: RetentionWindow
}

export type ReliabilityEntry = {
  key: string
  invocations: number
  successes: number
  success_rate: number | null
  identified_agents: number
  anonymous_invocations: number
  result_items: number
  p50_latency_ms: number | null
  p95_latency_ms: number | null
  last_observed_at: string
}

export type ReliabilitySummary = {
  window_start: string
  generated_at: string
  privacy: string
  overall: Omit<ReliabilityEntry, "key">
  tools: Array<
    ReliabilityEntry & {
      tool_name: string
      version: string | null
      provider_slug: string | null
    }
  >
  providers: Array<
    ReliabilityEntry & { provider_slug: string; provider_name: string }
  >
  clients: Array<ReliabilityEntry & { client: string }>
  sources: Array<ReliabilityEntry & { source: string }>
  errors: Array<{ error_type: string; events: number }>
}

function timestamp(value: InvocationMetricRow["created_at"]): number {
  if (typeof value === "number") return value
  return new Date(value).getTime()
}

function utcDay(value: number): string {
  return new Date(value).toISOString().slice(0, 10)
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null
  return Number((numerator / denominator).toFixed(4))
}

export function buildAgentRetention(
  rows: InvocationMetricRow[],
  now = new Date()
): AgentRetentionSummary {
  const byAgent = new Map<string, number[]>()
  for (const row of rows) {
    if (
      !row.success ||
      row.is_external !== true ||
      row.agent_identity_kind !== "explicit" ||
      !row.agent_key
    ) {
      continue
    }
    const observedAt = timestamp(row.created_at)
    if (!Number.isFinite(observedAt) || observedAt > now.getTime()) continue
    const observations = byAgent.get(row.agent_key) ?? []
    observations.push(observedAt)
    byAgent.set(row.agent_key, observations)
  }

  let repeatAgents = 0
  for (const observations of byAgent.values()) {
    observations.sort((a, b) => a - b)
    if (new Set(observations.map(utcDay)).size > 1) repeatAgents += 1
  }

  const window = (windowDays: 7 | 30): RetentionWindow => {
    const windowMs = windowDays * 24 * 60 * 60 * 1000
    let eligibleAgents = 0
    let retainedAgents = 0
    for (const observations of byAgent.values()) {
      const first = observations[0]
      if (first > now.getTime() - windowMs) continue
      eligibleAgents += 1
      const firstDay = utcDay(first)
      if (
        observations.some(
          (observedAt) =>
            observedAt > first &&
            observedAt <= first + windowMs &&
            utcDay(observedAt) !== firstDay
        )
      ) {
        retainedAgents += 1
      }
    }
    return {
      window_days: windowDays,
      eligible_agents: eligibleAgents,
      retained_agents: retainedAgents,
      retention_rate: rate(retainedAgents, eligibleAgents),
    }
  }

  return {
    definition:
      "An eligible Agent first succeeded at least 7 or 30 complete days ago. It is retained when it succeeds again on a later UTC day within that window. Only explicit, external, privacy-safe Agent HMACs are included.",
    repeat_agents_on_later_day: repeatAgents,
    day_7: window(7),
    day_30: window(30),
  }
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1)
  )
  return Math.round(sorted[index])
}

function aggregateEntry(
  key: string,
  rows: InvocationMetricRow[]
): ReliabilityEntry {
  const explicitAgents = new Set(
    rows
      .filter((row) => row.agent_identity_kind === "explicit" && row.agent_key)
      .map((row) => row.agent_key!)
  )
  const resultItems = rows.reduce(
    (sum, row) => sum + Math.max(0, row.result_count ?? 0),
    0
  )
  const lastObservedAt = Math.max(
    ...rows.map((row) => timestamp(row.created_at))
  )
  const successes = rows.filter((row) => row.success).length
  return {
    key,
    invocations: rows.length,
    successes,
    success_rate: rate(successes, rows.length),
    identified_agents: explicitAgents.size,
    anonymous_invocations: rows.filter(
      (row) => row.agent_identity_kind !== "explicit"
    ).length,
    result_items: resultItems,
    p50_latency_ms: percentile(
      rows.map((row) => Math.max(0, row.latency_ms)),
      0.5
    ),
    p95_latency_ms: percentile(
      rows.map((row) => Math.max(0, row.latency_ms)),
      0.95
    ),
    last_observed_at: new Date(lastObservedAt).toISOString(),
  }
}

function groups(
  rows: InvocationMetricRow[],
  keyFor: (row: InvocationMetricRow) => string | null
): Map<string, InvocationMetricRow[]> {
  const grouped = new Map<string, InvocationMetricRow[]>()
  for (const row of rows) {
    const key = keyFor(row)
    if (!key) continue
    const entries = grouped.get(key) ?? []
    entries.push(row)
    grouped.set(key, entries)
  }
  return grouped
}

function byEvidence(a: ReliabilityEntry, b: ReliabilityEntry): number {
  return (
    b.identified_agents - a.identified_agents || b.invocations - a.invocations
  )
}

export function buildReliabilitySummary(
  rows: InvocationMetricRow[],
  since: Date,
  now = new Date()
): ReliabilitySummary {
  const clockSkewAllowanceMs = 5 * 60 * 1000
  const externalRows = rows.filter(
    (row) =>
      row.is_external === true &&
      Number.isFinite(timestamp(row.created_at)) &&
      timestamp(row.created_at) >= since.getTime() &&
      timestamp(row.created_at) <= now.getTime() + clockSkewAllowanceMs
  )
  const overallEntry = externalRows.length
    ? aggregateEntry("overall", externalRows)
    : {
        key: "overall",
        invocations: 0,
        successes: 0,
        success_rate: null,
        identified_agents: 0,
        anonymous_invocations: 0,
        result_items: 0,
        p50_latency_ms: null,
        p95_latency_ms: null,
        last_observed_at: since.toISOString(),
      }

  const toolGroups = groups(
    externalRows,
    (row) =>
      `${row.tool_name}\u0000${row.version ?? ""}\u0000${row.provider_slug ?? ""}`
  )
  const tools = [...toolGroups.entries()]
    .map(([key, entries]) => {
      const first = entries[0]
      return {
        ...aggregateEntry(key, entries),
        tool_name: first.tool_name,
        version: first.version ?? null,
        provider_slug: first.provider_slug ?? null,
      }
    })
    .sort(byEvidence)

  const providerGroups = groups(
    externalRows,
    (row) => row.provider_slug ?? null
  )
  const providers = [...providerGroups.entries()]
    .map(([providerSlug, entries]) => ({
      ...aggregateEntry(providerSlug, entries),
      provider_slug: providerSlug,
      provider_name: entries[0].provider_name ?? providerSlug,
    }))
    .sort(byEvidence)

  const clientGroups = groups(
    externalRows,
    (row) => row.client_name ?? "unknown-client"
  )
  const clients = [...clientGroups.entries()]
    .map(([client, entries]) => ({
      ...aggregateEntry(client, entries),
      client,
    }))
    .sort(byEvidence)

  const sourceGroups = groups(
    externalRows,
    (row) => row.attribution_source ?? "direct"
  )
  const sources = [...sourceGroups.entries()]
    .map(([source, entries]) => ({
      ...aggregateEntry(source, entries),
      source,
    }))
    .sort(byEvidence)

  const errorCounts = new Map<string, number>()
  for (const row of externalRows) {
    if (row.success) continue
    const errorType = row.error_type ?? "unknown"
    errorCounts.set(errorType, (errorCounts.get(errorType) ?? 0) + 1)
  }

  const overall: Omit<ReliabilityEntry, "key"> = {
    invocations: overallEntry.invocations,
    successes: overallEntry.successes,
    success_rate: overallEntry.success_rate,
    identified_agents: overallEntry.identified_agents,
    anonymous_invocations: overallEntry.anonymous_invocations,
    result_items: overallEntry.result_items,
    p50_latency_ms: overallEntry.p50_latency_ms,
    p95_latency_ms: overallEntry.p95_latency_ms,
    last_observed_at: overallEntry.last_observed_at,
  }
  return {
    window_start: since.toISOString(),
    generated_at: now.toISOString(),
    privacy:
      "Aggregates external executions only. No Agent IDs, session IDs, IPs, prompts, arguments, or result content are returned or retained by this metric.",
    overall,
    tools,
    providers,
    clients,
    sources,
    errors: [...errorCounts.entries()]
      .map(([error_type, events]) => ({ error_type, events }))
      .sort(
        (a, b) =>
          b.events - a.events || a.error_type.localeCompare(b.error_type)
      ),
  }
}
