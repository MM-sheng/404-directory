# Prediction-market risk as the first vertical wedge

- Status: Accepted
- Date: 2026-08-26
- Supersedes: ADR 0002 as the primary acquisition wedge

## Context

404.directory has a working MCP surface, tool discovery, verification, Agent
attribution, risk receipts, and bounded outcome reporting. Those capabilities
do not by themselves create a reason for an external Agent to call 404.directory
during a real task. Generic official-document search, deployment checks, market
lookup, and Polymarket order execution already have direct providers and public
wrappers.

The product needs one narrow decision point where an Agent commonly makes a
costly mistake and where every call can later be compared with behavior and an
observable result.

## Decision

Use prediction-market settlement and execution-risk preflight as the first
vertical acquisition wedge.

The primary call is `evaluate_prediction_market`. It reads only public
Polymarket metadata and order-book data and returns a versioned `allow`,
`review`, or `block` decision. Policy v1 covers:

- market lifecycle and order availability;
- resolution-source specificity and timing boundaries;
- potentially subjective rule language;
- spread, nearby depth, and estimated slippage for stated notional;
- caller-observed geographic eligibility;
- supervised versus unattended action.

`report_prediction_market_outcome` captures only bounded behavior and execution
enums through a one-time token. The service stores public evidence snapshots,
their hash, privacy-safe Agent attribution, decisions, and bounded outcomes.

## Boundaries

Policy v1 does not:

- predict Yes or No;
- recommend or place a trade;
- access a wallet, key, or order payload;
- infer geographic eligibility from the 404.directory server location;
- independently verify off-platform event evidence;
- score third-party signals;
- claim profitability, calibration, insurance, or a universal reputation score.

## Data flywheel

The compounding record is:

```text
public market/rule/order-book snapshot
→ bounded Agent intent
→ versioned risk decision
→ Agent behavior outcome
→ later observed market resolution (future phase)
```

Public prices alone are not a moat. The decision-to-behavior-to-resolution
history can become one if Agents repeatedly use it and final outcomes are
attached independently.

## Success gates

Do not add another vertical until all of the following are observed:

- at least 10 identified real external Agents call the vertical tool;
- at least 30 non-test prediction-market evaluations are recorded;
- bounded outcome reporting shows whether any Agent changed behavior;
- a first cohort of evaluated markets reaches final resolution;
- policy errors and false confidence are reviewed before broadening scope.

The annual 1,000-Agent metric remains strict: only a de-duplicated external
Agent with at least one successful real tool call counts.

## Consequences

- Prediction-market preflight becomes the primary first-call story.
- Generic tool preflight remains supported as infrastructure, not the main
  acquisition message.
- Automatic market-resolution ingestion and calibration are the next data-layer
  milestone after production validation.
- Trading execution, custody, payment, insurance, and additional verticals are
  explicitly deferred.
