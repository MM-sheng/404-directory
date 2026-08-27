# Agent integration quickstart

The useful integration point is immediately before an Agent observes or acts
on an exact Polymarket market. Do not use `tools/list`, health checks, or the
404.directory homepage as the pilot task.

## Any TypeScript trading Agent

Use the risk SDK around the Agent's existing action function:

```ts
import { Directory404Client } from "@mmvv1638/404-directory-risk-sdk"

const risk = await Directory404Client.create({
  source: "prediction-agent-pilot",
  agentName: "stable-local-strategy-name",
})

const result = await risk.guardPredictionMarketAction(
  {
    market: exactPolymarketUrl,
    intended_action: "buy_yes",
    estimated_notional_usd: 100,
    execution_mode: "unattended",
    geographic_eligibility: "unknown",
  },
  () => existingAgent.placeOrder(order),
  { mode: "shadow" }
)
```

Start in `shadow` for seven days. The preflight and bounded outcome report run
on every real action, but the SDK does not alter execution. Move to `warn` only
after reviewing false positives and unavailable-call behavior. Use `enforce`
only when the operator explicitly wants fail-closed execution.

## Any Python trading Agent

```python
from directory404_risk import Directory404Client

risk = Directory404Client.create(
    source="prediction-agent-pilot",
    agent_name="stable-local-strategy-name",
)

result = risk.guard_prediction_market_action(
    {
        "market": exact_polymarket_url,
        "intended_action": "buy_yes",
        "estimated_notional_usd": 100,
        "execution_mode": "unattended",
        "geographic_eligibility": "unknown",
    },
    lambda: existing_agent.place_order(order),
    mode="shadow",
)
```

`AsyncDirectory404Client` provides the same policy for async Agents.

## ElizaOS

ElizaOS officially supports stdio MCP servers through `@elizaos/plugin-mcp`.
Use the identity-preserving bridge because the hosted 404.directory endpoint is
Streamable HTTP:

```ts
export const character = {
  name: "PredictionRiskAgent",
  plugins: ["@elizaos/plugin-bootstrap", "@elizaos/plugin-mcp"],
  settings: {
    mcp: {
      servers: {
        directory404: {
          type: "stdio",
          command: "npx",
          args: [
            "-y",
            "@mmvv1638/404-directory-mcp@0.10.0",
            "--source",
            "elizaos-pilot",
          ],
          env: {},
        },
      },
    },
  },
  system:
    "Before observing or contemplating a Polymarket action, call evaluate_prediction_market with the exact market and action. Never treat allow as a prediction. Obey block and pause on review.",
}
```

Test with one exact market the operator already follows. A listed tool is not a
successful integration; require a non-error `evaluate_prediction_market`
result.

Official reference: <https://docs.elizaos.ai/runtime/services#model-context-protocol-mcp-services>

## OpenClaw

OpenClaw can load Agent Plugin-compatible bundles. This repository already
contains a portable `plugin.json`, `mcp.json`, identity-preserving proxy, and
the `use-404-directory` Skill. From a checkout, install the repository root as
a local plugin, enable it, and restart the Gateway:

```text
openclaw plugins install /ABSOLUTE/PATH/TO/404-directory
openclaw plugins enable 404-directory
```

Then ask for the same exact-market preflight. The proxy recognizes OpenClaw's
MCP client name and reports only the safe client label `openclaw`; the random
installation ID is persisted in the plugin data directory.

Official references:

- <https://docs.openclaw.ai/plugins>
- <https://docs.openclaw.ai/plugins/bundles>

## Privacy and success criteria

- Never pass wallet keys, signed orders, order payloads, private strategy data,
  prompts, usernames, emails, or personal data.
- `source` is a lowercase campaign label, not a person.
- Each installation keeps one random `agent:<uuid>` locally. 404.directory
  stores only its HMAC digest after activity.
- Success requires a non-error risk evaluation. Repeat use requires another
  successful call on a later UTC day; reconnects and scans do not count.
