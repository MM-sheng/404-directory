import { createHash, randomUUID } from "node:crypto"
import type {
  PredictionMarketEvaluationRecord,
  RiskEvaluationRecord,
} from "../../src/domain/store.js"

export function riskRecord(
  overrides: Partial<RiskEvaluationRecord> = {}
): RiskEvaluationRecord {
  return {
    id: randomUUID(),
    target_tool_id: randomUUID(),
    target: {
      id: randomUUID(),
      slug: "fixture-tool",
      name: "Fixture tool",
      protocol: "mcp",
      status: "active",
      provider: { slug: "fixture", verified: true },
    },
    policy_version: "fixture-policy",
    context: {
      action: "invoke",
      data_sensitivity: "public",
      execution_mode: "supervised",
      permissions: ["public_network"],
    },
    decision: "review",
    confidence: 0.5,
    evidence_coverage: 0.5,
    reason_codes: ["FIXTURE_REVIEW"],
    risk_factors: [],
    evidence: [],
    unknowns: [],
    next_action: "Review",
    outcome_token_hash: createHash("sha256").update(randomUUID()).digest("hex"),
    agent_key: "a1_fixture_agent",
    agent_identity_kind: "explicit",
    client_name: "fixture-client",
    attribution_source: "fixture",
    is_external: true,
    created_at: "2026-08-27T10:00:00.000Z",
    expires_at: "2026-08-27T11:00:00.000Z",
    outcome: null,
    outcome_reported_at: null,
    ...overrides,
  }
}

export function predictionRecord(
  overrides: Partial<PredictionMarketEvaluationRecord> = {}
): PredictionMarketEvaluationRecord {
  return {
    id: randomUUID(),
    platform: "polymarket",
    market_id: "fixture-market",
    market_slug: "fixture-market",
    market_question: "Public fixture question?",
    market_snapshot: {
      condition_id: "fixture",
      description: "Public fixture rules",
      resolution_source: "https://example.com",
      end_date: null,
      updated_at: null,
      active: true,
      closed: false,
      accepting_orders: true,
      restricted: false,
      outcomes: ["Yes", "No"],
      prices: [0.5, 0.5],
      token_ids: ["1", "2"],
      best_bid: 0.49,
      best_ask: 0.51,
      spread: 0.02,
      liquidity_usd: 1000,
    },
    policy_version: "fixture-policy",
    intent: {
      intended_action: "observe",
      estimated_notional_usd: null,
      execution_mode: "supervised",
      geographic_eligibility: "unknown",
    },
    decision: "review",
    risk_score: 15,
    confidence: 0.5,
    reason_codes: ["FIXTURE_REVIEW"],
    risk_factors: [],
    evidence: [],
    unknowns: [],
    depth: null,
    next_action: "Review",
    snapshot_hash: "fixture-snapshot",
    outcome_token_hash: createHash("sha256").update(randomUUID()).digest("hex"),
    agent_key: "a1_fixture_agent",
    agent_identity_kind: "explicit",
    client_name: "fixture-client",
    attribution_source: "fixture",
    is_external: true,
    created_at: "2026-08-27T10:00:00.000Z",
    expires_at: "2026-08-27T11:00:00.000Z",
    outcome: null,
    outcome_reported_at: null,
    ...overrides,
  }
}
