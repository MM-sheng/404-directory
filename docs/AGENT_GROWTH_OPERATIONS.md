# Real Agent growth operating guide

## Objective

Reach 1,000 de-duplicated external Agents with at least one successful tool
execution by 2026-12-31. Never substitute views, installs, initialization,
anonymous calls, internal smoke or repeated sessions for qualified Agents.

## Daily scoreboard

Read these endpoints and keep a dated snapshot:

```text
GET /v1/metrics/agents
GET /v1/metrics/activation
GET /v1/metrics/reliability?days=7
GET /v1/metrics/reliability?days=30
```

Record:

- cumulative and new qualified Agents;
- remaining Agents and required daily/weekly pace;
- first-success rate from identified initialization to identified success;
- 7/30-day retention when the cohort is eligible;
- qualified Agents by source and client;
- tools/providers with the most evidence and the worst success/latency;
- top canonical error.

## First-10 pilot

Do not wait for passive directory traffic. Recruit independent developers,
Agent teams and MCP tool authors who already have a real task.

Each pilot participant must:

1. Control the Agent outside the 404.directory project.
2. Install through a source-labelled path.
3. See all 12 tools.
4. Complete a task relevant to their work.
5. Produce at least one non-error tool result.
6. Share only client/version, task category, failure stage and request ID when
   troubleshooting; never share content or credentials.

Validate each new metric entry before admitting it. The same person reinstalling
or generating many IDs is not growth.

## Outreach message

```text
404.directory is a public read-only MCP connection for official OpenAI,
Microsoft, AWS and Cloudflare documentation, deployment verification and
trusted tool discovery. We are validating the installation with real external
Agents. Install from https://404.directory/connect?source=external-pilot and
use it for one task you already need to complete. No account or API key is
required. Please report only your client/version and failure stage—never your
prompt, code, credentials or result content.
```

## Channel experiment

One channel and one major variable per seven-day window:

1. Give the channel a unique safe source label.
2. Freeze the page, install path and first task except for the selected variable.
3. Capture views, install clicks, identified initialization, identified success
   and eligible retention.
4. Compare qualified-Agent activation, not raw traffic.
5. Stop after two windows with zero qualified Agents.
6. Scale when a channel brings at least five qualified Agents and exceeds the
   overall activation baseline.

## Weekly cadence

- Monday: freeze the metric snapshot and select the largest bottleneck.
- Tuesday: fix only that install, activation or reliability bottleneck.
- Wednesday: onboard real external pilot users.
- Thursday: advance one high-value marketplace/client/tool-author channel.
- Friday: close the experiment and choose stop, change or scale.
- Weekend: monitor health and provider errors; do not add speculative features.

## Milestone gates

| Cumulative Agents | Evidence required before proceeding |
| ---: | --- |
| 10 | Individual admission audit, first-success time and first 7-day cohort |
| 50 | At least one repeatable source and two leading real task categories |
| 100 | Three client sources, three used tools/providers, retention baseline and a decision on signed-receipt research |
| 300 | Two effective sources, controlled error rate and no source over 70% without a diversification plan |
| 600 | Reliable acquisition pace, anomaly review and stable provider performance |
| 1,000 | Strict metric proof, 7/30-day retention, source/tool/provider breakdown and final definition snapshot |

## Stop rules

- Do not build identity, credit, insurance, payments or tokens before the
  100-Agent decision gate.
- Pause acquisition scaling if 7-day retention is below 15%; fix usefulness.
- Pause a provider path when its failures make the first useful call unreliable.
- Quarantine anomalous bursts of one-time IDs until reviewed.
- Never change the metric definition to make progress look better.
