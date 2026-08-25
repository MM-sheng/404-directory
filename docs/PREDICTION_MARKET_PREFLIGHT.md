# Prediction-market risk preflight

404.directory evaluates one public Polymarket market immediately before an AI
Agent observes or contemplates a Yes/No position. The first policy checks:

- whether the market is active and accepting orders;
- whether the settlement source and timing boundary are explicit;
- potentially subjective settlement language;
- current public order-book availability, nearby depth, spread, and estimated
  slippage for a stated notional;
- caller-observed geographic eligibility and supervised versus unattended use.

It returns `allow`, `review`, or `block`. It does not predict the winning
outcome, place or sign orders, access wallets, custody funds, or provide legal,
financial, or investment advice.

## Mandatory Agent trigger

```text
Before observing or contemplating a Polymarket Yes/No action, call
evaluate_prediction_market with the exact market, intended action, approximate
notional, execution mode, and the current geoblock result from the actual
execution environment. Obey block. On review, pause and resolve every listed
unknown or obtain human review. Do not interpret allow as a prediction or
guarantee. After the decision, call report_prediction_market_outcome using only
the one-time token and bounded behavior/execution fields. Never send wallet
keys, order payloads, prompts, personal data, or free-form trading rationale.
```

## MCP request

```json
{
  "name": "evaluate_prediction_market",
  "arguments": {
    "market": "https://polymarket.com/event/example-market",
    "intended_action": "buy_yes",
    "estimated_notional_usd": 100,
    "execution_mode": "supervised",
    "geographic_eligibility": "eligible"
  }
}
```

`intended_action` is one of `observe`, `buy_yes`, `buy_no`, `sell_yes`, or
`sell_no`. `geographic_eligibility` is `eligible`, `blocked`, or `unknown` and
must come from the execution environment; 404.directory does not infer it from
the server location.

The response includes:

- a versioned decision and conservative risk score;
- stable reason codes, evidence, unknowns, and next action;
- a public market snapshot hash;
- order-book depth and estimated slippage when notional is supplied;
- a receipt ID and one-time outcome token.

## Bounded feedback

```json
{
  "name": "report_prediction_market_outcome",
  "arguments": {
    "receipt_id": "RECEIPT_UUID",
    "outcome_token": "TOKEN_FROM_EVALUATION",
    "action_taken": "reduced_position",
    "execution_result": "executed"
  }
}
```

The service stores only the token hash. Behavior reports are self-reported and
do not establish profitability or prediction accuracy.

## REST

```text
POST /v1/prediction-markets/evaluations
GET  /v1/prediction-markets/evaluations/{receipt_id}
POST /v1/prediction-markets/evaluations/{receipt_id}/outcome
GET  /v1/metrics/prediction-market-evaluations
```

## Data boundary

Stored data is limited to public market/rule/order-book snapshots, a bounded
Agent intent, privacy-safe Agent attribution, the decision, and an optional
bounded behavior outcome. No wallet address, key, order payload, prompt, IP
address, personal data, or free-form rationale belongs in this workflow.

Policy v1 does not independently verify off-platform resolution evidence,
calibrate third-party signals, or automatically attach the final market
resolution. Those are explicit later phases and must not be implied by a v1
response.
