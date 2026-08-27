const baseUrl = (process.env.PILOT_BASE_URL ?? "https://404.directory").replace(
  /\/$/,
  ""
)
const baselineValue = process.env.PILOT_BASELINE_AGENTS
if (baselineValue === undefined || !/^\d+$/.test(baselineValue)) {
  throw new Error(
    "Set PILOT_BASELINE_AGENTS to the frozen identified_external_agents count"
  )
}
const baselineAgents = Number(baselineValue)
const cohortTarget = Number(process.env.PILOT_TARGET ?? 10)

function assertRecord(
  value: unknown,
  label: string
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} returned an invalid JSON object`)
  }
}

async function readJson(pathName: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}${pathName}`, {
    headers: {
      "X-404-Agent-Class": "internal",
      "X-404-Source": "pilot-status",
      "X-404-Client-Name": "pilot-status",
    },
  })
  if (!response.ok) {
    throw new Error(`${pathName} returned HTTP ${response.status}`)
  }
  const value: unknown = await response.json()
  assertRecord(value, pathName)
  return value
}

const [agents, activation, prediction] = await Promise.all([
  readJson("/v1/metrics/agents"),
  readJson("/v1/metrics/activation"),
  readJson("/v1/metrics/prediction-market-evaluations"),
])

const identifiedAgents = Number(agents.identified_external_agents ?? 0)
const gainedAgents = Math.max(0, identifiedAgents - baselineAgents)
const retention = agents.retention as Record<string, unknown> | undefined
const activationStages = Array.isArray(activation.stages)
  ? (activation.stages as Array<Record<string, unknown>>)
  : []
const activationSources = Array.isArray(activation.sources)
  ? (activation.sources as Array<Record<string, unknown>>)
  : []
const stage = (name: string) =>
  activationStages.find((item) => item.stage === name) ?? null
const connectedWithoutCalls = activationSources
  .filter(
    (item) =>
      Number(item.initialized_agents ?? 0) > 0 &&
      Number(item.tool_call_agents ?? 0) === 0
  )
  .map((item) => ({
    source: item.source,
    initialized_agents: Number(item.initialized_agents ?? 0),
    listed_agents: Number(item.tools_listed_agents ?? 0),
  }))

process.stdout.write(
  `${JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      base_url: baseUrl,
      pilot: {
        baseline_agents: baselineAgents,
        target_new_agents: cohortTarget,
        gained_agents: gainedAgents,
        remaining_agents: Math.max(0, cohortTarget - gainedAgents),
        first_success_gate_met: gainedAgents >= cohortTarget,
        repeat_agents_on_later_day: Number(
          retention?.repeat_agents_on_later_day ?? 0
        ),
      },
      qualified_usage: {
        identified_external_agents: identifiedAgents,
        successful_external_invocations: Number(
          agents.successful_external_invocations ?? 0
        ),
        sources: agents.sources ?? [],
        clients: agents.clients ?? [],
      },
      prediction_market: {
        evaluations: Number(prediction.evaluations ?? 0),
        external_evaluations: Number(prediction.external_evaluations ?? 0),
        identified_external_agents: Number(
          prediction.identified_external_agents ?? 0
        ),
        reported_outcomes: Number(prediction.reported_outcomes ?? 0),
        outcome_report_rate: prediction.outcome_report_rate ?? null,
        behavior_changes: Number(prediction.behavior_changes ?? 0),
      },
      activation: {
        tools_list: stage("tools_list"),
        tool_attempt: stage("tool_attempt"),
        successful_tool: stage("successful_tool"),
        failed_tool: stage("failed_tool"),
        connected_without_calls: connectedWithoutCalls,
      },
      warning:
        "This report cannot prove operator independence. Admit each pilot Agent only after the manual privacy-safe audit in docs/FIRST_10_AGENT_PILOT.md.",
    },
    null,
    2
  )}\n`
)
