# 404.directory risk SDK for TypeScript

Put an evidence-backed risk preflight immediately before an AI Agent's
Polymarket order function. The SDK never signs or places an order itself.

The v0.1.0 artifact is public and carries a GitHub Release SHA-256 digest:

```text
npm install https://github.com/MM-sheng/404-directory/releases/download/v0.10.1/mmvv1638-404-directory-risk-sdk-0.1.0.tgz
```

After the npm package is initialized, use
`npm install @mmvv1638/404-directory-risk-sdk`. From a repository checkout,
use `npm install ./packages/404-directory-risk-sdk`.

```ts
import { Directory404Client } from "@mmvv1638/404-directory-risk-sdk"

const risk = await Directory404Client.create({
  source: "my-polymarket-agent",
  agentName: "btc-15m-strategy",
})

const guarded = await risk.guardPredictionMarketAction(
  {
    market: "https://polymarket.com/event/example-market",
    intended_action: "buy_yes",
    estimated_notional_usd: 100,
    execution_mode: "unattended",
    geographic_eligibility: "eligible",
  },
  () => polymarket.placeOrder(order),
  { mode: "shadow" }
)
```

Each `agentName` receives one random locally persisted identity. The name never
leaves the machine; only a random `agent:<uuid>` is sent, and 404.directory
stores only an HMAC digest.

## Modes

- `shadow`: never changes execution. If preflight is unavailable, the supplied
  function still runs. Use for the first seven days of a pilot.
- `warn`: `allow` executes, `block` stops, and `review` requires an `onReview`
  callback returning `true`. Preflight failure stops execution.
- `enforce`: only `allow` executes. `review`, `block`, and preflight failure all
  stop execution.

When a receipt exists, the SDK automatically reports whether execution
occurred or failed. Outcome reporting failures never hide the execution result.

This SDK is risk-control middleware, not investment, financial, or legal
advice. It never predicts outcomes and must not receive wallet keys, signed
orders, prompts, personal information, or private strategy data.
