import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const DEFAULT_BASE_URL = "https://404.directory"
const SAFE_SOURCE = /^[a-z0-9][a-z0-9._-]{0,63}$/
const AGENT_ID =
  /^agent:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type GuardMode = "shadow" | "warn" | "enforce"
export type PredictionMarketDecision = "allow" | "review" | "block"
export type PredictionMarketAction =
  "observe" | "buy_yes" | "buy_no" | "sell_yes" | "sell_no"
export type GeographicEligibility = "eligible" | "blocked" | "unknown"
export type ExecutionMode = "supervised" | "unattended"
export type OutcomeAction =
  | "proceeded"
  | "reduced_position"
  | "changed_side"
  | "waited"
  | "requested_review"
  | "aborted"
export type FailureType =
  | "resolution_rules"
  | "liquidity"
  | "execution"
  | "data_quality"
  | "compliance"
  | "signal"
  | "other"

export interface PredictionMarketPreflightRequest {
  market: string
  intended_action: PredictionMarketAction
  estimated_notional_usd?: number
  execution_mode?: ExecutionMode
  geographic_eligibility?: GeographicEligibility
}

export interface PredictionMarketEvaluation {
  receipt_id: string
  outcome_token: string
  platform: "polymarket"
  policy_version: string
  decision: PredictionMarketDecision
  risk_score: number
  confidence: number
  reason_codes: string[]
  risk_factors: Array<{
    code: string
    severity: "low" | "medium" | "high" | "critical"
    explanation: string
  }>
  unknowns: string[]
  next_action: string
  [key: string]: unknown
}

export interface OutcomeReport {
  receipt_id: string
  status: "recorded" | "already_reported"
  evidence_level: "self_reported"
  [key: string]: unknown
}

export interface Directory404ClientOptions {
  source: string
  agentId?: string
  agentName?: string
  dataDirectory?: string
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export interface GuardOptions {
  mode?: GuardMode
  onReview?: (
    evaluation: PredictionMarketEvaluation
  ) => boolean | Promise<boolean>
  outcomeAction?: OutcomeAction
  failureType?: FailureType
}

export interface GuardResult<T> {
  mode: GuardMode
  evaluation: PredictionMarketEvaluation | null
  executed: boolean
  blocked_by_policy: boolean
  result?: T
  execution_error?: unknown
  preflight_error?: Directory404Error
  report?: OutcomeReport
  report_error?: Directory404Error
}

export class Directory404Error extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_configuration"
      | "invalid_response"
      | "request_failed"
      | "timeout",
    readonly status?: number,
    readonly retryable = false
  ) {
    super(message)
    this.name = "Directory404Error"
  }
}

function defaultDataDirectory(): string {
  if (process.env.DIRECTORY_404_DATA_DIR) {
    return path.resolve(process.env.DIRECTORY_404_DATA_DIR)
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA ?? process.env.APPDATA ?? os.homedir(),
      "404-directory"
    )
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "404-directory"
    )
  }
  return path.join(
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
    "404-directory"
  )
}

export async function loadOrCreateAgentId(
  agentName = "default",
  dataDirectory = defaultDataDirectory()
): Promise<string> {
  const agentKey = createHash("sha256")
    .update(agentName.trim().toLowerCase() || "default")
    .digest("hex")
    .slice(0, 24)
  const identityDirectory = path.join(dataDirectory, "risk-sdk", agentKey)
  const identityPath = path.join(identityDirectory, "agent-id")
  await mkdir(identityDirectory, { recursive: true })

  try {
    const existing = (await readFile(identityPath, "utf8")).trim()
    if (AGENT_ID.test(existing)) return existing
    throw new Directory404Error(
      `Refusing to overwrite invalid 404.directory Agent identity: ${identityPath}`,
      "invalid_configuration"
    )
  } catch (error) {
    if (
      error instanceof Directory404Error ||
      (error as NodeJS.ErrnoException).code !== "ENOENT"
    ) {
      throw error
    }
  }

  const agentId = `agent:${randomUUID()}`
  try {
    await writeFile(identityPath, `${agentId}\n`, {
      flag: "wx",
      mode: 0o600,
    })
    return agentId
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    const existing = (await readFile(identityPath, "utf8")).trim()
    if (AGENT_ID.test(existing)) return existing
    throw new Directory404Error(
      `Refusing to use invalid 404.directory Agent identity: ${identityPath}`,
      "invalid_configuration"
    )
  }
}

function errorMessage(value: unknown): string {
  if (!value || typeof value !== "object") return "Unknown 404.directory error"
  const record = value as Record<string, unknown>
  return typeof record.message === "string"
    ? record.message
    : typeof record.error === "string"
      ? record.error
      : "Unknown 404.directory error"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function validateEvaluation(value: unknown): PredictionMarketEvaluation {
  if (!isRecord(value)) {
    throw new Directory404Error(
      "404.directory returned an invalid prediction-market evaluation",
      "invalid_response"
    )
  }
  const decision = value.decision
  const valid =
    typeof value.receipt_id === "string" &&
    typeof value.outcome_token === "string" &&
    value.outcome_token.length >= 32 &&
    value.platform === "polymarket" &&
    typeof value.policy_version === "string" &&
    (decision === "allow" || decision === "review" || decision === "block") &&
    typeof value.risk_score === "number" &&
    Number.isFinite(value.risk_score) &&
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    Array.isArray(value.reason_codes) &&
    Array.isArray(value.risk_factors) &&
    Array.isArray(value.unknowns) &&
    typeof value.next_action === "string"
  if (!valid) {
    throw new Directory404Error(
      "404.directory returned an incomplete prediction-market evaluation",
      "invalid_response"
    )
  }
  return value as unknown as PredictionMarketEvaluation
}

function validateOutcomeReport(value: unknown): OutcomeReport {
  if (
    !isRecord(value) ||
    typeof value.receipt_id !== "string" ||
    (value.status !== "recorded" && value.status !== "already_reported") ||
    value.evidence_level !== "self_reported"
  ) {
    throw new Directory404Error(
      "404.directory returned an invalid outcome report",
      "invalid_response"
    )
  }
  return value as unknown as OutcomeReport
}

export class Directory404Client {
  private constructor(
    readonly agentId: string,
    readonly source: string,
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch
  ) {}

  static async create(
    options: Directory404ClientOptions
  ): Promise<Directory404Client> {
    if (!SAFE_SOURCE.test(options.source)) {
      throw new Directory404Error(
        "source must be a lowercase non-personal label using a-z, 0-9, dot, underscore, or hyphen",
        "invalid_configuration"
      )
    }
    if (options.agentId && !AGENT_ID.test(options.agentId)) {
      throw new Directory404Error(
        "agentId must be a random UUID v4 prefixed with 'agent:'; never use an email, user name, or device name",
        "invalid_configuration"
      )
    }
    const agentId =
      options.agentId ??
      (await loadOrCreateAgentId(
        options.agentName ?? options.source,
        options.dataDirectory
      ))
    return new Directory404Client(
      agentId,
      options.source,
      (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
      options.timeoutMs ?? 8_000,
      options.fetchImpl ?? fetch
    )
  }

  private async post<T>(pathName: string, body: unknown): Promise<T> {
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${pathName}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-404-agent-id": this.agentId,
          "x-404-source": this.source,
          "x-404-client-name": "agent-risk-sdk-ts",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      const timeout =
        error instanceof Error && /abort|timeout/i.test(error.message)
      throw new Directory404Error(
        timeout
          ? "404.directory preflight timed out"
          : "404.directory preflight request failed",
        timeout ? "timeout" : "request_failed",
        undefined,
        true
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Directory404Error(
        `404.directory returned non-JSON HTTP ${response.status}`,
        "invalid_response",
        response.status,
        response.status >= 500
      )
    }
    if (!response.ok) {
      throw new Directory404Error(
        errorMessage(payload),
        "request_failed",
        response.status,
        response.status === 408 ||
          response.status === 429 ||
          response.status >= 500
      )
    }
    return payload as T
  }

  preflightPredictionMarket(
    request: PredictionMarketPreflightRequest
  ): Promise<PredictionMarketEvaluation> {
    return this.post<unknown>(
      "/v1/prediction-markets/evaluations",
      request
    ).then(validateEvaluation)
  }

  reportPredictionMarketOutcome(
    evaluation: Pick<
      PredictionMarketEvaluation,
      "receipt_id" | "outcome_token"
    >,
    outcome: {
      action_taken: OutcomeAction
      execution_result: "executed" | "not_executed" | "failed" | "unknown"
      failure_type?: FailureType
    }
  ): Promise<OutcomeReport> {
    return this.post<unknown>(
      `/v1/prediction-markets/evaluations/${encodeURIComponent(evaluation.receipt_id)}/outcome`,
      {
        outcome_token: evaluation.outcome_token,
        ...outcome,
      }
    ).then(validateOutcomeReport)
  }

  async guardPredictionMarketAction<T>(
    request: PredictionMarketPreflightRequest,
    execute: () => T | Promise<T>,
    options: GuardOptions = {}
  ): Promise<GuardResult<T>> {
    const mode = options.mode ?? "shadow"
    let evaluation: PredictionMarketEvaluation
    try {
      evaluation = await this.preflightPredictionMarket(request)
    } catch (error) {
      const preflightError =
        error instanceof Directory404Error
          ? error
          : new Directory404Error(
              "404.directory preflight failed",
              "request_failed",
              undefined,
              true
            )
      if (mode !== "shadow") {
        return {
          mode,
          evaluation: null,
          executed: false,
          blocked_by_policy: true,
          preflight_error: preflightError,
        }
      }
      try {
        return {
          mode,
          evaluation: null,
          executed: true,
          blocked_by_policy: false,
          result: await execute(),
          preflight_error: preflightError,
        }
      } catch (executionError) {
        return {
          mode,
          evaluation: null,
          executed: true,
          blocked_by_policy: false,
          execution_error: executionError,
          preflight_error: preflightError,
        }
      }
    }

    let shouldExecute = mode === "shadow" || evaluation.decision === "allow"
    if (
      mode === "warn" &&
      evaluation.decision === "review" &&
      options.onReview
    ) {
      shouldExecute = await options.onReview(evaluation)
    }

    if (!shouldExecute) {
      const actionTaken: OutcomeAction =
        evaluation.decision === "review" ? "requested_review" : "aborted"
      const result: GuardResult<T> = {
        mode,
        evaluation,
        executed: false,
        blocked_by_policy: true,
      }
      try {
        result.report = await this.reportPredictionMarketOutcome(evaluation, {
          action_taken: actionTaken,
          execution_result: "not_executed",
        })
      } catch (error) {
        result.report_error =
          error instanceof Directory404Error
            ? error
            : new Directory404Error(
                "404.directory outcome report failed",
                "request_failed",
                undefined,
                true
              )
      }
      return result
    }

    const result: GuardResult<T> = {
      mode,
      evaluation,
      executed: true,
      blocked_by_policy: false,
    }
    try {
      result.result = await execute()
      try {
        result.report = await this.reportPredictionMarketOutcome(evaluation, {
          action_taken: options.outcomeAction ?? "proceeded",
          execution_result: "executed",
        })
      } catch (error) {
        result.report_error =
          error instanceof Directory404Error
            ? error
            : new Directory404Error(
                "404.directory outcome report failed",
                "request_failed",
                undefined,
                true
              )
      }
    } catch (executionError) {
      result.execution_error = executionError
      try {
        result.report = await this.reportPredictionMarketOutcome(evaluation, {
          action_taken: options.outcomeAction ?? "proceeded",
          execution_result: "failed",
          failure_type: options.failureType ?? "execution",
        })
      } catch (error) {
        result.report_error =
          error instanceof Directory404Error
            ? error
            : new Directory404Error(
                "404.directory outcome report failed",
                "request_failed",
                undefined,
                true
              )
      }
    }
    return result
  }
}
