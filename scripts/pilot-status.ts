import {
  pilotVerifiedProgress,
  readPilotPredictionEvidence,
} from "../src/domain/pilot-evidence.js"

const baseUrl = (process.env.PILOT_BASE_URL ?? "https://404.directory").replace(
  /\/$/,
  ""
)
const baselineAgentValue = process.env.PILOT_BASELINE_VERIFIED_AGENTS
const baselineOperatorValue = process.env.PILOT_BASELINE_VERIFIED_OPERATORS
if (
  baselineAgentValue === undefined ||
  !/^\d+$/.test(baselineAgentValue) ||
  baselineOperatorValue === undefined ||
  !/^\d+$/.test(baselineOperatorValue)
) {
  throw new Error(
    "Set PILOT_BASELINE_VERIFIED_AGENTS and PILOT_BASELINE_VERIFIED_OPERATORS to the frozen verified counts"
  )
}
const baselineAgents = Number(baselineAgentValue)
const baselineOperators = Number(baselineOperatorValue)
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

const [verified, agents, activation, prediction] = await Promise.all([
  readJson("/v1/metrics/verified-agents"),
  readJson("/v1/metrics/agents"),
  readJson("/v1/metrics/activation"),
  readJson("/v1/metrics/prediction-market-evaluations"),
])

const verifiedAgents = Number(verified.verified_external_agents ?? 0)
const verifiedOperators = Number(verified.verified_operators ?? 0)
const retention = verified.retention as Record<string, unknown> | undefined
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
        ...pilotVerifiedProgress(
          baselineAgents,
          verifiedAgents,
          baselineOperators,
          verifiedOperators,
          cohortTarget
        ),
      },
      verified_usage: {
        verified_external_agents: verifiedAgents,
        verified_operators: verifiedOperators,
        active_admissions: Number(verified.active_admissions ?? 0),
        repeat_agents_on_later_day: Number(
          retention?.repeat_agents_on_later_day ?? 0
        ),
        successful_external_invocations: Number(
          verified.successful_external_invocations ?? 0
        ),
        sources: verified.sources ?? [],
      },
      unverified_installation_diagnostics: {
        identified_external_agents: Number(
          agents.identified_external_agents ?? 0
        ),
        successful_external_invocations: Number(
          agents.successful_external_invocations ?? 0
        ),
        sources: agents.sources ?? [],
        clients: agents.clients ?? [],
      },
      prediction_market: readPilotPredictionEvidence(prediction),
      activation: {
        tools_list: stage("tools_list"),
        tool_attempt: stage("tool_attempt"),
        successful_tool: stage("successful_tool"),
        failed_tool: stage("failed_tool"),
        connected_without_calls: connectedWithoutCalls,
      },
      warning:
        "Only verified_usage counts toward the pilot. Unverified installation diagnostics, listings, probes, and internal tests never count.",
    },
    null,
    2
  )}\n`
)
