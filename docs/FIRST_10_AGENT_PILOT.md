# First 10 real Agent pilot

## Goal

Recruit 10 independently controlled external Agents that each complete a real
prediction-market or unfamiliar-tool preflight, then return on a later UTC day.
This pilot optimizes repeated useful calls, not directory scans or installs.

## Frozen baseline

Verified-evidence baseline frozen at 2026-08-29 16:14 UTC:

- 0 verified external Agents and 0 verified independent operators;
- 2 unverified installation-ID digests and 15 successful invocations;
- 0 verified Agents with a successful call on a later UTC day;
- current unverified activity includes a `curl` client and project-run
  verification, so none is retroactively admitted;
- 15 prediction-market evaluations, 9 external, and 0 external outcome reports.

The cohort target is 10 verified external Agents controlled by 10 independently
verified operators. Unverified installation IDs are diagnostic only.

## Recruitment pipeline

Prospects and listings do not count as cohort members. This table exists only
to keep acquisition focused on operators with a real recurring execution
boundary.

| Target                          | Why it can produce repeat use                                                           | Current action                                                                                                       | State                        |
| ------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| BlockRunAI `polymarket-agent`   | Python Agent calls a concrete CLOB executor with market, action, and size available     | [Optional seven-day shadow preflight proposed](https://github.com/BlockRunAI/polymarket-agent/issues/5)              | Awaiting maintainer decision |
| `polymarket-agent-mcp`          | TypeScript MCP server has one live `TradeExecutor` boundary with slug, side, and amount | [Tested shadow implementation submitted](https://github.com/demwick/polymarket-agent-mcp/pull/97)                    | Awaiting maintainer review   |
| Awesome Prediction Market Tools | Active vertical audience already operates prediction-market Agents and bots             | [Accurate open-source AI Agent entry submitted](https://github.com/aarora4/Awesome-Prediction-Market-Tools/pull/194) | Maintainer review            |

Do not post the same pitch across repositories. A project receives a proposal
only when its public code exposes the exact information needed for a bounded
preflight. If a maintainer declines or does not engage, record that result and
move to a different integration shape.

## Admission rule

An Agent enters the cohort only when all of the following are true:

1. It is controlled outside the 404.directory project.
2. It has one stable random installation identity.
3. It uses one exact market or tool the operator already cared about.
4. A risk-evaluation tool returns a non-error result.
5. No prompt, market position, wallet data, credentials, or personal data is
   shared for troubleshooting.

The same operator creating multiple IDs does not create multiple Agents.

The execution-ready implementation is now
[polymarket-agent-mcp #97](https://github.com/demwick/polymarket-agent-mcp/pull/97).
It is fully tested but remains a prospect until an independent maintainer merges,
enables shadow mode, and produces a successful real-task invocation.

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

| Slot | Client family | Integration | First success UTC | Later-day success | Outcome reported | State      |
| ---: | ------------- | ----------- | ----------------- | ----------------- | ---------------- | ---------- |
|    1 | —             | —           | —                 | —                 | —                | recruiting |
|    2 | —             | —           | —                 | —                 | —                | recruiting |
|    3 | —             | —           | —                 | —                 | —                | recruiting |
|    4 | —             | —           | —                 | —                 | —                | recruiting |
|    5 | —             | —           | —                 | —                 | —                | recruiting |
|    6 | —             | —           | —                 | —                 | —                | recruiting |
|    7 | —             | —           | —                 | —                 | —                | recruiting |
|    8 | —             | —           | —                 | —                 | —                | recruiting |
|    9 | —             | —           | —                 | —                 | —                | recruiting |
|   10 | —             | —           | —                 | —                 | —                | recruiting |

## Public measurement

Use these public, privacy-safe summaries:

```text
https://404.directory/v1/metrics/agents
https://404.directory/v1/metrics/verified-agents
https://404.directory/v1/metrics/activation
https://404.directory/v1/metrics/prediction-market-evaluations
```

Run the local summary from the frozen verified baseline:

```text
PILOT_BASELINE_VERIFIED_AGENTS=0 PILOT_BASELINE_VERIFIED_OPERATORS=0 npm run pilot:status
```

The output uses `verified_usage` for the pilot and reports installation IDs only
under `unverified_installation_diagnostics`. A verified Agent must have both an
active manual evidence admission and a matching successful external explicit
tool invocation. The first-10 gate also requires 10 verified operators.

Prediction-market outcomes come only from `scopes.identified_external` in
`risk-attribution-v2`. Internal and anonymous outcomes are not pilot outcomes.
An older deployment without that breakdown produces `status: "unavailable"`
and null values, not fallback to its mixed totals or fabricated zero usage.
Outcome reports are self-reports, not verified prevented losses or causal
proof that 404 improved a decision.

The pilot passes when:

- `verified_external_agents` and `verified_operators` each increase by 10 from
  the frozen baseline;
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
