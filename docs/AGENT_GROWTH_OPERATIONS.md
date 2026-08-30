# Real Agent growth operating guide

## Objective

Reach 1,000 de-duplicated external Agents with independent-operator evidence
and at least one successful tool execution by 2026-12-31. Never substitute
views, installs, initialization, anonymous calls, internal smoke or repeated
sessions for qualified Agents.

## Daily scoreboard

Read these endpoints and keep a dated snapshot:

```text
GET /v1/metrics/agents
GET /v1/metrics/verified-agents
GET /v1/metrics/activation
GET /v1/metrics/reliability?days=7
GET /v1/metrics/reliability?days=30
```

Record:

- cumulative and new verified qualified Agents and verified operators;
- remaining Agents and required daily/weekly pace;
- call rate from identified initialization to any identified tool attempt;
- prompt exposure and selection from identified `prompts/list` and
  `prompts/get` events;
- prompt-to-success rate from an identified prompt selection to an identified
  successful tool call;
- tool success rate from identified attempt to identified success;
- first-success rate from identified initialization to identified success;
- 7/30-day retention when the cohort is eligible;
- verified qualified Agents by source, plus unverified installation diagnostics
  by client;
- tools/providers with the most evidence and the worst success/latency;
- top canonical error.

## First-10 pilot

Do not wait for passive directory traffic. Recruit independent developers,
Agent teams and MCP tool authors who already have a real task.

Each pilot participant must:

1. Control the Agent outside the 404.directory project.
2. Install through a source-labelled path.
3. See all 16 tools, including `evaluate_prediction_market` and
   `evaluate_tool_risk`.
4. Complete one task they already needed: preflight an exact market they were
   already watching, or preflight an unfamiliar tool they were considering.
5. Produce at least one non-error tool result.
6. Share only client/version, task category, failure stage and request ID when
   troubleshooting; never share content or credentials.

Admit each participant with privacy-safe independent-operator evidence, then
require a matching successful external execution. The same person reinstalling
or generating many IDs is not growth.

## Outreach message

```text
404.directory gives an AI Agent a risk preflight before it acts. If you already
use an Agent to watch Polymarket, send one exact market you care about and get
an evidence-backed settlement, liquidity, eligibility, and execution-risk
decision—without prediction or trading. Or preflight one unfamiliar MCP tool
before installing it. Install from
https://404.directory/connect?source=external-pilot and use it on that real
task. No account or API key is required. Please report only your client/version
and failure stage—never your prompt, code, credentials, market position, or
result content.
```

## Channel experiment

One channel and one major variable per seven-day window:

1. Give the channel a unique safe source label.
2. Freeze the page, install path and first task except for the selected variable.
3. Capture views, install clicks, identified initialization, identified tool
   prompt exposure/selection, identified tool attempt, identified
   failure/success and eligible retention.
4. Compare qualified-Agent activation, not raw traffic.
5. Stop after two windows with zero qualified Agents.
6. Scale when a channel brings at least five qualified Agents and exceeds the
   overall activation baseline.

## Weekly cadence

- Monday: freeze the metric snapshot and select the largest bottleneck.
- Tuesday: fix only that install, activation or reliability bottleneck.
- When the bottleneck is `tools/list → tools/call`, test a protocol-native task
  prompt before adding another tool. A prompt experiment succeeds only when it
  increases qualified successful Agents.
- Wednesday: onboard real external pilot users.
- Thursday: advance one high-value marketplace/client/tool-author channel.
- Friday: close the experiment and choose stop, change or scale.
- Weekend: monitor health and provider errors; do not add speculative features.

## Milestone gates

| Cumulative Agents | Evidence required before proceeding                                                                            |
| ----------------: | -------------------------------------------------------------------------------------------------------------- |
|                10 | Individual admission audit, first-success time and first 7-day cohort                                          |
|                50 | At least one repeatable source and two leading real task categories                                            |
|               100 | Three client sources, three used tools/providers, retention baseline and a decision on signed-receipt research |
|               300 | Two effective sources, controlled error rate and no source over 70% without a diversification plan             |
|               600 | Reliable acquisition pace, anomaly review and stable provider performance                                      |
|             1,000 | Strict metric proof, 7/30-day retention, source/tool/provider breakdown and final definition snapshot          |

## Stop rules

- Do not build identity, credit, insurance, payments or tokens before the
  100-Agent decision gate.
- Pause acquisition scaling if 7-day retention is below 15%; fix usefulness.
- Pause a provider path when its failures make the first useful call unreliable.
- Quarantine anomalous bursts of one-time IDs until reviewed.
- Never change the metric definition to make progress look better.
