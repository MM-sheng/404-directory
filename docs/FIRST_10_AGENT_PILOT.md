# First 10 real Agent pilot

## Goal

Recruit 10 independently controlled external Agents that each complete a real
prediction-market or unfamiliar-tool preflight, then return on a later UTC day.
This pilot optimizes repeated useful calls, not directory scans or installs.

## Frozen baseline

Frozen at 2026-08-27 08:34 UTC, before this pilot implementation is deployed:

- 1 identified external Agent and 6 qualified successful invocations;
- 0 Agents with a successful call on a later UTC day;
- 24 identified Agents initialized and 23 listed tools, but only 1 identified
  Agent attempted or completed a tool call;
- 3 prediction-market evaluations, of which 1 was external but anonymous;
- 1 prediction-market outcome report.

The cohort target is therefore 11 cumulative identified external Agents, with
10 new independently controlled Agents admitted after this baseline.

## Admission rule

An Agent enters the cohort only when all of the following are true:

1. It is controlled outside the 404.directory project.
2. It has one stable random installation identity.
3. It uses one exact market or tool the operator already cared about.
4. A risk-evaluation tool returns a non-error result.
5. No prompt, market position, wallet data, credentials, or personal data is
   shared for troubleshooting.

The same operator creating multiple IDs does not create multiple Agents.

## Seven-day sequence

### Day 0: install and first useful call

- TypeScript/Python trading bots: integrate the risk SDK in `shadow` mode.
- Cursor, Claude, Codex, ElizaOS, or OpenClaw: install the MCP connection with
  stable identity and run the exact-market starter prompt.
- Record only client/version, safe source label, success/failure stage, and
  request ID.

### Days 1–6: normal work

- Leave the integration in the operator's real workflow.
- Do not ask participants to manufacture calls.
- For an action-oriented bot, preflight each action at the existing execution
  boundary. For a research Agent, preflight only markets it actually examines.
- Fix repeated provider or schema failures before recruiting more Agents.

### Day 7: return test

- Confirm each Agent has at least one successful call on a later UTC day.
- Ask one qualitative question: did the decision change, delay, or clarify an
  action? Store only a bounded answer (`yes`, `no`, `unknown`), never rationale.
- Keep `shadow`, move to `warn`, or remove the integration based on observed
  value and false positives.

## Cohort board

Do not put names, emails, wallet addresses, prompts, or market positions here.

| Slot | Client family | Integration | First success UTC | Later-day success | Outcome reported | State |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | — | — | — | — | — | recruiting |
| 2 | — | — | — | — | — | recruiting |
| 3 | — | — | — | — | — | recruiting |
| 4 | — | — | — | — | — | recruiting |
| 5 | — | — | — | — | — | recruiting |
| 6 | — | — | — | — | — | recruiting |
| 7 | — | — | — | — | — | recruiting |
| 8 | — | — | — | — | — | recruiting |
| 9 | — | — | — | — | — | recruiting |
| 10 | — | — | — | — | — | recruiting |

## Public measurement

Use these public, privacy-safe summaries:

```text
https://404.directory/v1/metrics/agents
https://404.directory/v1/metrics/activation
https://404.directory/v1/metrics/prediction-market-evaluations
```

Freeze the current `identified_external_agents` value before recruitment, then
run the local summary with that number:

```text
PILOT_BASELINE_AGENTS=1 npm run pilot:status
```

This calculates progress but cannot prove that operators are independent; the
manual admission rule remains mandatory.

The pilot passes when:

- `identified_external_agents` increases by 10 from the frozen baseline;
- the prediction-market summary shows non-test external evaluations;
- every admitted Agent has a successful later-day call;
- outcome reports exist for at least 7 of the 10 Agents;
- no single provider failure blocks the first useful call for more than one
  participant without a documented fix.

## Stop conditions

- If 3 consecutive Agents fail at the same stage, pause recruitment and fix it.
- If fewer than 3 of the first 10 return on a later day, do not scale promotion;
  improve decision quality or workflow placement first.
- If operators say the result duplicates what their Agent already knows, narrow
  the market/risk contract instead of adding unrelated tools.
- Never claim 10 real Agents from internal smoke tests, scanners, reinstalling,
  or manually generated identities.
