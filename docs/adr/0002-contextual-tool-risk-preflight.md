# Contextual tool risk preflight as the first trust wedge

- Status: Accepted
- Date: 2026-08-24
- Owners: 404.directory

## Context

404.directory has working discovery, provider verification, tool lifecycle,
verification checks, Trust Profiles, a curated gateway, and privacy-safe Agent
attribution. These parts do not yet create a required position in an Agent's
workflow. An Agent can search for tools and then bypass 404.directory entirely.

The immediate product goal is real external Agent use, followed by behavioral
evidence that can compound into a credible trust layer. The project is operated
by a small team, has one production service and one Postgres database, and does
not yet have enough adoption to justify microservices, public-key Agent
identity, universal reputation, payments, or insurance.

## Decision

Add a contextual preflight decision before an Agent installs or invokes a
third-party catalog tool:

```text
tool + intended action + data sensitivity + execution mode + permissions
                                 |
                                 v
                 evidence-backed allow / review / block
                                 |
                                 v
                    one-time outcome feedback token
```

The first policy is `tool-preflight-v1`. It evaluates only registered catalog
tools and returns stable reason codes, evidence coverage, evidence freshness,
remaining unknowns, and a bounded next action. Missing evidence is never a
positive signal.

Each decision is stored in an append-only `risk_evaluations` record. The record
contains only enumerated context and evidence snapshots; it excludes prompts,
arguments, outputs, credentials, IP addresses, and raw Agent identifiers.

The response includes a random one-time outcome token. Only its SHA-256 hash is
stored. The token can attach one bounded outcome to the decision: whether the
Agent proceeded, changed tools, requested review, or aborted, and whether the
result succeeded, failed, was not executed, or remains unknown.

Self-reported outcomes are explicitly labeled and do not directly change Trust
scores. Executions observed by the 404.directory gateway remain a stronger
evidence class.

## Options considered

| Option                                     | Benefits                                                             | Costs                                                                        | Decision |
| ------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| Add more generic tools                     | Fast and familiar                                                    | Does not create a required workflow position or unique data                  | Rejected |
| Build identity and signed receipts first   | Strong long-term integrity                                           | Large adoption and key-management burden before product pull is proven       | Deferred |
| Publish a universal Trust score            | Simple interface                                                     | Context-free, gameable, and easy to overclaim                                | Rejected |
| Contextual preflight plus bounded feedback | Direct Agent value, uses current evidence, creates a measurable loop | Initial decisions have incomplete evidence; feedback is partly self-reported | Accepted |

## Architecture

- Keep the existing modular monolith and `CatalogStore` persistence port.
- Implement policy evaluation in the domain layer, exposed through both REST
  and MCP.
- Store decisions in Postgres and provide an in-memory implementation for
  deterministic tests.
- Keep policy rules versioned and deterministic. Do not introduce a model call
  into the authorization path.
- Add `evaluate_tool_risk` and `report_tool_outcome` to the existing MCP server.
- Add `POST /v1/evaluations`, `GET /v1/evaluations/:id`, and
  `POST /v1/evaluations/:id/outcome` for non-MCP Agent runtimes.

## Trade-offs and mitigations

- **A self-reported result is not independently verified.** It is stored as
  behavioral evidence only and cannot directly increase Trust.
- **A bearer capability token can be copied.** It is random, stored only as a
  hash, bound to one decision, and accepted once. Stronger signatures remain a
  later step.
- **The catalog does not describe every possible permission.** Callers must
  declare context; high-risk permissions outside the current evidence boundary
  are blocked.
- **A deterministic policy may be conservative.** Stable reason codes and
  recorded policy versions allow later calibration from override and outcome
  data.
- **One database table adds schema work.** This is less costly than a separate
  service and keeps deployment and transactions simple.

## Success criteria

- External Agents call the preflight before a real install or first invocation.
- The service measures decision counts, allow/review/block distribution,
  decision overrides, reported results, repeated Agents, and policy version.
- At least 10 real external Agents complete a preflight and at least one later
  action; at least 3 repeat within seven days.
- The data reveals whether decisions change behavior before broader identity or
  reputation infrastructure is built.

## Revisit triggers

Revisit this decision when one of the following occurs:

- 100 identified external Agents have used the preflight;
- an external relying party needs independently verifiable receipts;
- replay, collusion, or outcome poisoning affects product decisions;
- one service cannot meet the measured evaluation latency or availability need;
- legal or contractual requirements demand stronger identity or audit controls.

Until then, do not introduce microservices, blockchain, financial credit,
insurance, or a universal entity score.
