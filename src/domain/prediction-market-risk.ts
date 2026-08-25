import { createHash, randomBytes, randomUUID } from "node:crypto"
import { z } from "zod"
import { currentAgentAttribution } from "./agent-attribution.js"
import type {
  CatalogStore,
  PredictionMarketEvaluationOutcome,
  PredictionMarketEvaluationRecord,
} from "./store.js"

export const PREDICTION_MARKET_POLICY_VERSION = "polymarket-preflight-v1"
export const PREDICTION_MARKET_RECEIPT_TTL_MS = 60 * 60 * 1_000

const MarketActionSchema = z.enum([
  "observe",
  "buy_yes",
  "buy_no",
  "sell_yes",
  "sell_no",
])

export const EvaluatePredictionMarketRequestSchema = z
  .object({
    market: z
      .string()
      .min(1)
      .max(512)
      .describe(
        "A Polymarket market URL, numeric market ID, or exact market slug. Other hosts are rejected."
      ),
    intended_action: MarketActionSchema.describe(
      "The next action under consideration. Use observe for research that will not place an order."
    ),
    estimated_notional_usd: z
      .number()
      .finite()
      .min(0.01)
      .max(100_000)
      .optional()
      .describe(
        "Approximate USD notional of the contemplated order. Include it for depth and slippage analysis; this never places an order."
      ),
    execution_mode: z
      .enum(["supervised", "unattended"])
      .default("supervised")
      .describe("Whether a human will supervise the contemplated action."),
    geographic_eligibility: z
      .enum(["eligible", "blocked", "unknown"])
      .default("unknown")
      .describe(
        "Caller-observed result of Polymarket's geoblock check from the actual execution environment. It is self-reported and not independently verified by 404.directory."
      ),
  })
  .strict()

export type EvaluatePredictionMarketRequest = z.infer<
  typeof EvaluatePredictionMarketRequestSchema
>

export const PredictionMarketOutcomeRequestSchema = z
  .object({
    outcome_token: z.string().min(32).max(128),
    action_taken: z.enum([
      "proceeded",
      "reduced_position",
      "changed_side",
      "waited",
      "requested_review",
      "aborted",
    ]),
    execution_result: z.enum(["executed", "not_executed", "failed", "unknown"]),
    failure_type: z
      .enum([
        "resolution_rules",
        "liquidity",
        "execution",
        "data_quality",
        "compliance",
        "signal",
        "other",
      ])
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.execution_result !== "failed" && value.failure_type) {
      context.addIssue({
        code: "custom",
        path: ["failure_type"],
        message:
          "failure_type is accepted only when execution_result is failed",
      })
    }
  })

export type PredictionMarketOutcomeRequest = z.infer<
  typeof PredictionMarketOutcomeRequestSchema
>

const GammaMarketSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    question: z.string(),
    slug: z.string(),
    conditionId: z.string().optional().default(""),
    description: z.string().optional().default(""),
    resolutionSource: z
      .string()
      .nullish()
      .transform((value) => value ?? ""),
    endDate: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    updatedAt: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    active: z.boolean().optional().default(false),
    closed: z.boolean().optional().default(false),
    acceptingOrders: z.boolean().optional().default(false),
    enableOrderBook: z.boolean().optional().default(false),
    restricted: z.boolean().optional().default(false),
    outcomes: z.union([z.string(), z.array(z.string())]),
    outcomePrices: z.union([
      z.string(),
      z.array(z.union([z.string(), z.number()])),
    ]),
    clobTokenIds: z
      .union([z.string(), z.array(z.union([z.string(), z.number()]))])
      .optional()
      .default("[]"),
    liquidityNum: z.number().nullish(),
    liquidity: z.union([z.string(), z.number()]).nullish(),
    bestBid: z.number().nullish(),
    bestAsk: z.number().nullish(),
    spread: z.number().nullish(),
  })
  .passthrough()

const OrderLevelSchema = z.object({
  price: z.string(),
  size: z.string(),
})

const OrderBookSchema = z.object({
  market: z.string(),
  asset_id: z.string(),
  timestamp: z.string(),
  bids: z.array(OrderLevelSchema),
  asks: z.array(OrderLevelSchema),
})

type GammaMarket = z.infer<typeof GammaMarketSchema>
type OrderBook = z.infer<typeof OrderBookSchema>

export type PredictionMarketReference =
  { kind: "id"; value: string } | { kind: "slug"; value: string }

export interface PredictionMarketDataSource {
  getMarket(reference: PredictionMarketReference): Promise<unknown>
  getOrderBook(tokenId: string): Promise<unknown>
}

export class PredictionMarketInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PredictionMarketInputError"
  }
}

export class PredictionMarketNotFoundError extends Error {
  constructor(reference: string) {
    super(`Polymarket market not found: ${reference}`)
    this.name = "PredictionMarketNotFoundError"
  }
}

export class PredictionMarketUpstreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PredictionMarketUpstreamError"
  }
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function parseJsonArray(value: string | unknown[]): unknown[] {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function parsePredictionMarketReference(
  input: string
): PredictionMarketReference {
  const trimmed = input.trim()
  if (/^\d{1,32}$/.test(trimmed)) return { kind: "id", value: trimmed }

  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL
    try {
      url = new URL(trimmed)
    } catch {
      throw new PredictionMarketInputError("Invalid Polymarket market URL.")
    }
    if (!["polymarket.com", "www.polymarket.com"].includes(url.hostname)) {
      throw new PredictionMarketInputError(
        "Only public polymarket.com market URLs are accepted."
      )
    }
    const segments = url.pathname.split("/").filter(Boolean)
    const slug = segments.at(-1)
    if (!slug || ["event", "market"].includes(slug)) {
      throw new PredictionMarketInputError(
        "The URL must identify one specific Polymarket market."
      )
    }
    return parsePredictionMarketReference(slug)
  }

  if (/^[a-z0-9][a-z0-9-]{1,199}$/.test(trimmed)) {
    return { kind: "slug", value: trimmed }
  }
  throw new PredictionMarketInputError(
    "market must be a Polymarket URL, numeric market ID, or lowercase market slug."
  )
}

async function readJsonResponse(
  response: Response,
  maxBodyBytes: number
): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    throw new PredictionMarketUpstreamError(
      "Polymarket response exceeded the configured size limit."
    )
  }
  const text = await response.text()
  if (Buffer.byteLength(text, "utf8") > maxBodyBytes) {
    throw new PredictionMarketUpstreamError(
      "Polymarket response exceeded the configured size limit."
    )
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new PredictionMarketUpstreamError(
      "Polymarket returned an invalid JSON response."
    )
  }
}

export class PolymarketPublicDataSource implements PredictionMarketDataSource {
  constructor(
    private readonly options: {
      fetchImpl?: typeof fetch
      timeoutMs?: number
      maxBodyBytes?: number
    } = {}
  ) {}

  private async get(url: URL): Promise<unknown> {
    const fetchImpl = this.options.fetchImpl ?? fetch
    let response: Response
    try {
      response = await fetchImpl(url, {
        headers: {
          accept: "application/json",
          "user-agent": "404.directory prediction-market-risk/1",
        },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 6_000),
      })
    } catch (error) {
      throw new PredictionMarketUpstreamError(
        error instanceof Error && /abort|timeout/i.test(error.message)
          ? "Polymarket request timed out."
          : "Polymarket public API is temporarily unavailable."
      )
    }
    if (response.status === 404) {
      throw new PredictionMarketNotFoundError(url.pathname)
    }
    if (!response.ok) {
      throw new PredictionMarketUpstreamError(
        `Polymarket public API returned HTTP ${response.status}.`
      )
    }
    return readJsonResponse(response, this.options.maxBodyBytes ?? 2_000_000)
  }

  getMarket(reference: PredictionMarketReference): Promise<unknown> {
    const path =
      reference.kind === "id"
        ? `/markets/${encodeURIComponent(reference.value)}`
        : `/markets/slug/${encodeURIComponent(reference.value)}`
    return this.get(new URL(path, "https://gamma-api.polymarket.com"))
  }

  getOrderBook(tokenId: string): Promise<unknown> {
    const url = new URL("/book", "https://clob.polymarket.com")
    url.searchParams.set("token_id", tokenId)
    return this.get(url)
  }
}

type RiskFactor = PredictionMarketEvaluationRecord["risk_factors"][number]
type Evidence = PredictionMarketEvaluationRecord["evidence"][number]

function ruleAnalysis(market: GammaMarket): {
  sourceStatus: "specific" | "generic" | "missing"
  timeStatus: "specific" | "limited"
  ambiguousTerms: string[]
  evidence: Evidence[]
} {
  const rules = market.description.trim()
  const normalized = `${market.resolutionSource}\n${rules}`.toLowerCase()
  const genericSourcePatterns = [
    "consensus of credible reporting",
    "consensus of reputable reporting",
    "credible reporting",
    "reputable reporting",
    "widely reported",
  ]
  const specificSource =
    Boolean(market.resolutionSource.trim()) ||
    /https?:\/\//i.test(rules) ||
    /(?:according to|data (?:from|published by)|official (?:website|announcement|results?)|primary resolution source (?:is|will be) (?!a consensus))/i.test(
      rules
    )
  const genericSource = genericSourcePatterns.some((pattern) =>
    normalized.includes(pattern)
  )
  const sourceStatus = genericSource
    ? "generic"
    : specificSource
      ? "specific"
      : "missing"
  const hasDate =
    /\b(?:20\d{2}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(
      rules
    )
  const hasBoundary =
    /\b(?:am|pm|et|est|edt|utc|gmt|before|after|by|between|through|end of|start of)\b/i.test(
      rules
    )
  const timeStatus = hasDate && hasBoundary ? "specific" : "limited"
  const subjectivePatterns = [
    "significant",
    "substantial",
    "major",
    "material",
    "credible reporting",
    "reputable reporting",
    "widely reported",
    "clear consensus",
    "otherwise loses",
    "prevented from fulfilling",
  ]
  const ambiguousTerms = subjectivePatterns.filter((term) =>
    normalized.includes(term)
  )
  return {
    sourceStatus,
    timeStatus,
    ambiguousTerms,
    evidence: [
      {
        kind: "resolution_rules",
        status:
          sourceStatus === "specific"
            ? "pass"
            : sourceStatus === "generic"
              ? "warn"
              : "unknown",
        source: `https://polymarket.com/event/${market.slug}`,
        summary:
          sourceStatus === "specific"
            ? "The public rules name or link a specific resolution source."
            : sourceStatus === "generic"
              ? "The rules rely on a generic reporting consensus rather than one deterministic source."
              : "No specific resolution source was detected in the public market fields.",
        observed_at: market.updatedAt,
      },
      {
        kind: "time_boundary",
        status: timeStatus === "specific" ? "pass" : "warn",
        source: `https://polymarket.com/event/${market.slug}`,
        summary:
          timeStatus === "specific"
            ? "The rules contain a date and an explicit timing boundary or timezone."
            : "The rules do not expose both a date and a clear timing boundary.",
        observed_at: market.updatedAt,
      },
    ],
  }
}

type DepthAnalysis = {
  available_notional_usd: number
  coverage_ratio: number | null
  estimated_average_price: number | null
  estimated_slippage_bps: number | null
  best_price: number | null
  observed_at: string | null
}

function analyzeDepth(
  book: OrderBook,
  action: EvaluatePredictionMarketRequest["intended_action"],
  notional: number | undefined
): DepthAnalysis {
  const buying = action.startsWith("buy_")
  const levels = (buying ? book.asks : book.bids)
    .map((level) => ({
      price: numberOrNull(level.price),
      size: numberOrNull(level.size),
    }))
    .filter(
      (level): level is { price: number; size: number } =>
        level.price !== null &&
        level.size !== null &&
        level.price > 0 &&
        level.size > 0
    )
    .sort((a, b) => (buying ? a.price - b.price : b.price - a.price))
  const best = levels[0]?.price ?? null
  if (best === null) {
    return {
      available_notional_usd: 0,
      coverage_ratio: notional ? 0 : null,
      estimated_average_price: null,
      estimated_slippage_bps: null,
      best_price: null,
      observed_at: numberOrNull(book.timestamp)
        ? new Date(Number(book.timestamp)).toISOString()
        : null,
    }
  }

  const maxPrice = buying ? best + 0.02 : Math.max(0, best - 0.02)
  const inWindow = levels.filter((level) =>
    buying ? level.price <= maxPrice : level.price >= maxPrice
  )
  const available = inWindow.reduce(
    (sum, level) => sum + level.price * level.size,
    0
  )
  let remaining = notional ?? 0
  let filledNotional = 0
  let filledShares = 0
  if (notional) {
    for (const level of levels) {
      if (remaining <= 0) break
      const levelNotional = level.price * level.size
      const consumed = Math.min(remaining, levelNotional)
      filledNotional += consumed
      filledShares += consumed / level.price
      remaining -= consumed
    }
  }
  const average = filledShares > 0 ? filledNotional / filledShares : null
  const slippage =
    average === null ? null : (Math.abs(average - best) / best) * 10_000
  return {
    available_notional_usd: Number(available.toFixed(2)),
    coverage_ratio: notional
      ? Number(Math.min(99, available / notional).toFixed(4))
      : null,
    estimated_average_price:
      average === null ? null : Number(average.toFixed(6)),
    estimated_slippage_bps:
      slippage === null ? null : Number(slippage.toFixed(1)),
    best_price: best,
    observed_at: numberOrNull(book.timestamp)
      ? new Date(Number(book.timestamp)).toISOString()
      : null,
  }
}

export type PredictionMarketEvaluationPublic = Omit<
  PredictionMarketEvaluationRecord,
  | "id"
  | "market_id"
  | "market_slug"
  | "market_question"
  | "market_snapshot"
  | "outcome_token_hash"
  | "agent_key"
  | "agent_identity_kind"
  | "client_name"
  | "attribution_source"
  | "is_external"
> & {
  receipt_id: string
  market: {
    id: string
    slug: string
    question: string
    url: string
    outcomes: string[]
    prices: Array<{ outcome: string; price: number | null }>
    end_date: string | null
    updated_at: string | null
  }
  limitations: string[]
}

export type PredictionMarketEvaluationCreated =
  PredictionMarketEvaluationPublic & {
    outcome_token: string
    outcome_reporting: {
      mcp_tool: "report_prediction_market_outcome"
      rest_endpoint: string
      privacy: string
    }
  }

function publicEvaluation(
  record: PredictionMarketEvaluationRecord
): PredictionMarketEvaluationPublic {
  return {
    receipt_id: record.id,
    platform: record.platform,
    market: {
      id: record.market_id,
      slug: record.market_slug,
      question: record.market_question,
      url: `https://polymarket.com/event/${record.market_slug}`,
      outcomes: record.market_snapshot.outcomes,
      prices: record.market_snapshot.outcomes.map((outcome, index) => ({
        outcome,
        price: record.market_snapshot.prices[index] ?? null,
      })),
      end_date: record.market_snapshot.end_date,
      updated_at: record.market_snapshot.updated_at,
    },
    policy_version: record.policy_version,
    intent: record.intent,
    decision: record.decision,
    risk_score: record.risk_score,
    confidence: record.confidence,
    reason_codes: record.reason_codes,
    risk_factors: record.risk_factors,
    evidence: record.evidence,
    unknowns: record.unknowns,
    depth: record.depth,
    next_action: record.next_action,
    snapshot_hash: record.snapshot_hash,
    created_at: record.created_at,
    expires_at: record.expires_at,
    outcome: record.outcome,
    outcome_reported_at: record.outcome_reported_at,
    limitations: [
      "This is a deterministic preflight over public Polymarket metadata and order-book data, not investment, legal, or financial advice.",
      "404.directory does not predict the winning outcome and does not place, sign, or custody orders or funds.",
      "Rule-language checks are conservative heuristics and do not replace reading the full current market rules.",
      "Geographic eligibility is caller-supplied; verify it again from the actual execution environment immediately before trading.",
      "The first policy version does not independently verify off-platform evidence or calibrate third-party signals.",
    ],
  }
}

export async function evaluatePredictionMarket(
  store: CatalogStore,
  rawInput: EvaluatePredictionMarketRequest,
  dataSource: PredictionMarketDataSource = new PolymarketPublicDataSource(),
  publicBaseUrl = "https://404.directory"
): Promise<PredictionMarketEvaluationCreated> {
  const input = EvaluatePredictionMarketRequestSchema.parse(rawInput)
  const reference = parsePredictionMarketReference(input.market)
  const rawMarket = await dataSource.getMarket(reference)
  const marketResult = GammaMarketSchema.safeParse(rawMarket)
  if (!marketResult.success) {
    throw new PredictionMarketUpstreamError(
      "Polymarket market metadata did not match the expected public schema."
    )
  }
  const market = marketResult.data
  const outcomes = parseJsonArray(market.outcomes).map(String)
  const prices = parseJsonArray(market.outcomePrices).map(numberOrNull)
  const tokenIds = parseJsonArray(market.clobTokenIds).map(String)
  const yesIndex = outcomes.findIndex(
    (outcome) => outcome.toLowerCase() === "yes"
  )
  const noIndex = outcomes.findIndex(
    (outcome) => outcome.toLowerCase() === "no"
  )
  const trading = input.intended_action !== "observe"
  const targetIndex = input.intended_action.endsWith("_yes")
    ? yesIndex
    : input.intended_action.endsWith("_no")
      ? noIndex
      : -1

  let depth: DepthAnalysis | null = null
  let orderBookAvailable = false
  if (
    trading &&
    market.enableOrderBook &&
    targetIndex >= 0 &&
    tokenIds[targetIndex]
  ) {
    try {
      const rawBook = await dataSource.getOrderBook(tokenIds[targetIndex]!)
      const book = OrderBookSchema.parse(rawBook)
      depth = analyzeDepth(
        book,
        input.intended_action,
        input.estimated_notional_usd
      )
      orderBookAvailable = depth.best_price !== null
    } catch {
      orderBookAvailable = false
    }
  }

  const rules = ruleAnalysis(market)
  const riskFactors: RiskFactor[] = []
  const reasonCodes = new Set<string>()
  const unknowns: string[] = []
  let decision: "allow" | "review" | "block" = "allow"

  const addRisk = (
    code: string,
    severity: RiskFactor["severity"],
    explanation: string,
    requiredDecision: "allow" | "review" | "block"
  ) => {
    reasonCodes.add(code)
    riskFactors.push({ code, severity, explanation })
    if (requiredDecision === "block") decision = "block"
    else if (requiredDecision === "review" && decision === "allow") {
      decision = "review"
    }
  }

  if (!market.active || market.closed || (trading && !market.acceptingOrders)) {
    addRisk(
      "MARKET_NOT_TRADEABLE",
      "critical",
      "The public market metadata says this market is inactive, closed, or not accepting orders.",
      "block"
    )
  }
  if (trading && (yesIndex < 0 || noIndex < 0 || targetIndex < 0)) {
    addRisk(
      "OUTCOME_MAPPING_UNSUPPORTED",
      "critical",
      "This policy currently supports only markets with explicit Yes and No outcomes.",
      "block"
    )
  }
  if (trading && (!market.enableOrderBook || !orderBookAvailable)) {
    addRisk(
      "ORDERBOOK_UNAVAILABLE",
      "critical",
      "No usable public order book was available for the intended outcome.",
      "block"
    )
  }
  if (rules.sourceStatus === "missing") {
    unknowns.push("A deterministic resolution source was not found.")
    addRisk(
      "RESOLUTION_SOURCE_MISSING",
      "high",
      "The public fields do not identify a deterministic resolution source.",
      "review"
    )
  } else if (rules.sourceStatus === "generic") {
    addRisk(
      "RESOLUTION_SOURCE_GENERIC",
      "high",
      "Resolution depends on a reporting consensus that may require subjective judgment.",
      "review"
    )
  }
  if (rules.timeStatus === "limited") {
    unknowns.push("The rules do not expose a fully explicit time boundary.")
    addRisk(
      "TIME_BOUNDARY_UNCLEAR",
      "medium",
      "A date plus explicit boundary or timezone was not detected in the public rules.",
      "review"
    )
  }
  if (rules.ambiguousTerms.length > 0) {
    addRisk(
      "SUBJECTIVE_RULE_LANGUAGE",
      "medium",
      `Potentially subjective rule language detected: ${rules.ambiguousTerms.join(", ")}.`,
      "review"
    )
  }

  const spread =
    market.spread ??
    (market.bestBid !== null &&
    market.bestBid !== undefined &&
    market.bestAsk !== null &&
    market.bestAsk !== undefined
      ? market.bestAsk - market.bestBid
      : null)
  if (trading && spread !== null && spread >= 0.05) {
    addRisk(
      "WIDE_SPREAD",
      "high",
      `The current bid-ask spread is ${(spread * 100).toFixed(2)} percentage points.`,
      "review"
    )
  } else if (trading && spread !== null && spread >= 0.02) {
    addRisk(
      "ELEVATED_SPREAD",
      "medium",
      `The current bid-ask spread is ${(spread * 100).toFixed(2)} percentage points.`,
      "review"
    )
  }
  if (
    trading &&
    input.estimated_notional_usd &&
    depth?.coverage_ratio !== null &&
    depth?.coverage_ratio !== undefined &&
    depth.coverage_ratio < 0.5
  ) {
    addRisk(
      "SEVERE_DEPTH_SHORTFALL",
      "critical",
      "Order-book notional within two price points covers less than half of the intended size.",
      "block"
    )
  } else if (
    trading &&
    input.estimated_notional_usd &&
    depth?.coverage_ratio !== null &&
    depth?.coverage_ratio !== undefined &&
    depth.coverage_ratio < 1
  ) {
    addRisk(
      "INSUFFICIENT_NEARBY_DEPTH",
      "high",
      "Order-book notional within two price points does not cover the intended size.",
      "review"
    )
  }
  if (
    trading &&
    depth?.estimated_slippage_bps !== null &&
    depth?.estimated_slippage_bps !== undefined &&
    depth.estimated_slippage_bps >= 300
  ) {
    addRisk(
      "HIGH_ESTIMATED_SLIPPAGE",
      "high",
      `Estimated book slippage is ${depth.estimated_slippage_bps.toFixed(0)} basis points for the stated notional.`,
      "review"
    )
  }
  if (trading && input.geographic_eligibility === "blocked") {
    addRisk(
      "GEOGRAPHICALLY_BLOCKED",
      "critical",
      "The caller reports that Polymarket blocks order placement from the execution environment.",
      "block"
    )
  } else if (trading && input.geographic_eligibility === "unknown") {
    unknowns.push("Geographic trading eligibility has not been checked.")
    addRisk(
      "GEOGRAPHIC_ELIGIBILITY_UNKNOWN",
      "high",
      "Check Polymarket geographic eligibility from the actual execution environment before placing an order.",
      "review"
    )
  }
  if (trading && input.execution_mode === "unattended") {
    addRisk(
      "UNATTENDED_TRADING_REQUIRES_REVIEW",
      "high",
      "The first policy version does not allow an unattended financial action without human review.",
      "review"
    )
  }
  if (trading && !input.estimated_notional_usd) {
    unknowns.push(
      "No intended notional was supplied, so size-specific depth was not evaluated."
    )
    reasonCodes.add("SIZE_SPECIFIC_DEPTH_NOT_EVALUATED")
  }

  if (decision === "allow") reasonCodes.add("PREFLIGHT_PASSED")
  const severityWeight = { low: 5, medium: 15, high: 30, critical: 60 }
  const riskScore = Math.min(
    100,
    riskFactors.reduce(
      (sum, factor) => sum + severityWeight[factor.severity],
      0
    )
  )
  const evidenceChecks = [
    Boolean(market.description),
    rules.sourceStatus !== "missing",
    rules.timeStatus === "specific",
    !trading || orderBookAvailable,
    !trading || Boolean(input.estimated_notional_usd),
    !trading || input.geographic_eligibility !== "unknown",
  ]
  const confidence = Number(
    Math.max(
      0.1,
      Math.min(
        0.95,
        evidenceChecks.filter(Boolean).length / evidenceChecks.length
      )
    ).toFixed(4)
  )
  const now = new Date()
  const createdAt = now.toISOString()
  const expiresAt = new Date(
    now.getTime() + PREDICTION_MARKET_RECEIPT_TTL_MS
  ).toISOString()
  const outcomeToken = randomBytes(32).toString("base64url")
  const attribution = currentAgentAttribution()
  const snapshot = {
    condition_id: market.conditionId,
    description: market.description,
    resolution_source: market.resolutionSource,
    end_date: market.endDate,
    updated_at: market.updatedAt,
    active: market.active,
    closed: market.closed,
    accepting_orders: market.acceptingOrders,
    restricted: market.restricted,
    outcomes,
    prices,
    token_ids: tokenIds,
    best_bid: market.bestBid ?? null,
    best_ask: market.bestAsk ?? null,
    spread,
    liquidity_usd:
      market.liquidityNum ?? numberOrNull(market.liquidity) ?? null,
  }
  const snapshotHash = sha256(JSON.stringify(snapshot))
  const nextAction =
    decision === "allow"
      ? "Proceed only with the stated size and minimum permissions, then report the bounded behavior outcome."
      : decision === "review"
        ? "Pause the contemplated order and resolve the listed rule, liquidity, eligibility, or supervision issues."
        : "Do not place the contemplated order while any blocking condition remains."

  const record: PredictionMarketEvaluationRecord = {
    id: randomUUID(),
    platform: "polymarket",
    market_id: market.id,
    market_slug: market.slug,
    market_question: market.question,
    market_snapshot: snapshot,
    policy_version: PREDICTION_MARKET_POLICY_VERSION,
    intent: {
      intended_action: input.intended_action,
      estimated_notional_usd: input.estimated_notional_usd ?? null,
      execution_mode: input.execution_mode,
      geographic_eligibility: input.geographic_eligibility,
    },
    decision,
    risk_score: riskScore,
    confidence,
    reason_codes: [...reasonCodes],
    risk_factors: riskFactors,
    evidence: [
      {
        kind: "market_metadata",
        status:
          market.active && !market.closed
            ? "pass"
            : market.closed
              ? "fail"
              : "warn",
        source: `https://gamma-api.polymarket.com/markets/${market.id}`,
        summary: `Market active=${market.active}, closed=${market.closed}, accepting_orders=${market.acceptingOrders}.`,
        observed_at: createdAt,
      },
      ...rules.evidence,
      ...(trading
        ? [
            {
              kind: "order_book" as const,
              status: orderBookAvailable
                ? ("pass" as const)
                : ("fail" as const),
              source: "https://clob.polymarket.com/book",
              summary: orderBookAvailable
                ? `Usable order book found; nearby depth is $${(depth?.available_notional_usd ?? 0).toFixed(2)}.`
                : "No usable order book was available for the intended outcome.",
              observed_at: depth?.observed_at ?? createdAt,
            },
          ]
        : []),
    ],
    unknowns: [...new Set(unknowns)],
    depth,
    next_action: nextAction,
    snapshot_hash: snapshotHash,
    outcome_token_hash: tokenHash(outcomeToken),
    agent_key: attribution?.agent_key ?? null,
    agent_identity_kind: attribution?.agent_identity_kind ?? "anonymous",
    client_name: attribution?.client_name ?? null,
    attribution_source: attribution?.attribution_source ?? "direct",
    is_external: attribution?.is_external ?? false,
    created_at: createdAt,
    expires_at: expiresAt,
    outcome: null,
    outcome_reported_at: null,
  }
  await store.recordPredictionMarketEvaluation(record)
  return {
    ...publicEvaluation(record),
    outcome_token: outcomeToken,
    outcome_reporting: {
      mcp_tool: "report_prediction_market_outcome",
      rest_endpoint: `${publicBaseUrl.replace(/\/$/, "")}/v1/prediction-markets/evaluations/${record.id}/outcome`,
      privacy:
        "Report only bounded behavior and execution enums. Never send wallet keys, order payloads, prompts, personal data, or trading rationale.",
    },
  }
}

export async function getPredictionMarketEvaluationReceipt(
  store: CatalogStore,
  id: string
): Promise<PredictionMarketEvaluationPublic | null> {
  const record = await store.getPredictionMarketEvaluation(id)
  return record ? publicEvaluation(record) : null
}

export async function reportPredictionMarketOutcome(
  store: CatalogStore,
  receiptId: string,
  rawOutcome: PredictionMarketOutcomeRequest
): Promise<"recorded" | "not_found" | "already_reported"> {
  const outcome = PredictionMarketOutcomeRequestSchema.parse(rawOutcome)
  const boundedOutcome: PredictionMarketEvaluationOutcome = {
    action_taken: outcome.action_taken,
    execution_result: outcome.execution_result,
    failure_type: outcome.failure_type ?? null,
    evidence_level: "self_reported",
  }
  return store.recordPredictionMarketEvaluationOutcome({
    id: receiptId,
    outcome_token_hash: tokenHash(outcome.outcome_token),
    outcome: boundedOutcome,
    reported_at: new Date().toISOString(),
  })
}
