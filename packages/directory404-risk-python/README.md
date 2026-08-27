# 404.directory risk SDK for Python

Dependency-free Python middleware that places a 404.directory risk preflight
immediately before an AI Agent's Polymarket order function. It never signs or
places an order itself.

Before the package's first public release, install it from this repository
checkout with `python -m pip install ./packages/directory404-risk-python`.
After release, use `python -m pip install directory404-risk`.

```python
from directory404_risk import Directory404Client

risk = Directory404Client.create(
    source="my-polymarket-agent",
    agent_name="btc-15m-strategy",
)

guarded = risk.guard_prediction_market_action(
    {
        "market": "https://polymarket.com/event/example-market",
        "intended_action": "buy_yes",
        "estimated_notional_usd": 100,
        "execution_mode": "unattended",
        "geographic_eligibility": "eligible",
    },
    lambda: polymarket.place_order(order),
    mode="shadow",
)
```

`AsyncDirectory404Client` provides the same workflow for async Agents.

## Modes

- `shadow`: never changes execution, including when preflight is unavailable.
- `warn`: blocks `block`; `review` requires an explicit `on_review` approval.
- `enforce`: only executes an `allow` decision.

Each `agent_name` maps locally to one random persisted Agent ID. The name never
leaves the machine. Outcome reporting is automatic when a preflight receipt is
available and never hides the trading function's result or error.

This SDK is risk-control middleware, not investment, financial, or legal
advice. Never send it wallet keys, signed orders, prompts, personal information,
or private strategy data.
