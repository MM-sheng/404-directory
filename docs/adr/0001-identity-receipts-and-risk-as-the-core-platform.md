# Make identity, receipts, and risk the core platform

- Status: Accepted
- Date: 2026-08-23
- Owners: 404.directory

## Context and problem statement

404.directory currently offers discovery, a curated MCP gateway, provider
verification, tool trust profiles, and privacy-safe invocation telemetry. These
features are useful as an adoption surface, but a directory or a small gateway
is easy for a large model vendor, marketplace, or MCP client to reproduce.

The current telemetry also has limited compounding value. Anonymous calls,
probes, self-tests, and provider-declared outcomes cannot establish that a
specific external Agent behaved reliably. A generic tool score cannot answer a
more important question: whether a particular Agent should be allowed to take a
particular action, with a particular tool and exposure, now.

The platform therefore needs a durable role that remains useful across model
vendors, Agent runtimes, tool marketplaces, and payment providers.

## Decision drivers

- Build a cross-platform asset that does not depend on owning the largest tool
  directory.
- Let independent parties verify who acted, what was authorized, and what
  happened without storing prompts, tool arguments, or results.
- Turn repeated real executions into defensible identity, reputation, and risk
  data.
- Resist self-reporting, replay, Sybil identities, and reputation poisoning.
- Keep the first implementation operationally simple and avoid premature
  financial, token, and regulatory complexity.
- Preserve the current target of 1,000 deduplicated external Agents with at
  least one successful tool call, while making each qualifying call produce
  stronger evidence.

## Considered options

### Continue as a directory and tool gateway

This is the simplest continuation and remains useful for distribution. It does
not create a strong moat because clients and model vendors can bundle discovery
and execution directly.

### Build a generic analytics product or universal trust score

This creates dashboards quickly, but mixes identity, reputation, and risk into
an opaque number. It is easy to game and is not sufficiently actionable for a
relying party.

### Build identity, verifiable receipts, and contextual risk decisions

This creates a neutral evidence and decision layer that both Agents and tools
can depend on. It requires careful security and adoption work but produces an
asset that improves with verified, diverse usage.

### Start with payments or financial credit

Payments could produce strong outcome signals, but starting here adds legal,
fraud, custody, dispute, and regulatory complexity before the identity and
evidence foundation exists.

## Decision

404.directory will treat tool discovery and execution as the **edge and
acquisition layer**, not the core product. The core platform will consist of
the following four domains.

### 1. Agent Identity

Create stable pseudonymous identities backed by public keys. Support challenge
verification, key rotation, revocation, and optional organization or provider
attestations. Authentication required by external marketplaces may use OAuth,
but an email address, user-agent string, IP address, or client-supplied header
is not an Agent identity.

### 2. Verifiable Execution Receipts

Record append-only, versioned receipts for real actions. A receipt minimally
binds:

- Agent identity and signing key
- tool and provider identity plus tool version
- authorization or routing decision ID
- coarse task and outcome classifications
- latency and cost buckets
- counterparty attestation, timestamps, nonce, and schema version
- cryptographic signatures and verification status

Receipts must not contain raw prompts, secrets, tool arguments, or tool results.
The service must provide idempotency and replay protection. Self-reported Agent
success without an independent counterparty attestation does not contribute to
reputation.

### 3. Contextual Risk Decisions

Expose versioned decisions such as `allow`, `deny`, `step_up`, and `limit`, with
reason codes and evidence freshness. Decisions are contextual: the same Agent
may be allowed to search public documentation but denied a destructive or
high-exposure action.

The risk engine consumes verified identity attributes, signed receipts,
recency, counterparty diversity, task class, requested capability, and exposure.
It does not expose a single universal social score.

### 4. Reputation Projections

Derive separate, inspectable reputation views for Agents, tools, providers, and
capabilities from verified receipts. The existing tool Trust Profile remains a
bootstrap signal and must not be presented as authoritative evidence of Agent
creditworthiness.

The terms have distinct meanings:

- **Identity** answers who or what is acting.
- **Reputation** summarizes verified past behavior.
- **Risk** decides what should be allowed in a specific context.
- **Credit** represents economic exposure and repayment expectations; financial
  credit is deferred until transaction evidence, legal design, and compliance
  controls exist.

## Target architecture

```text
Agent / platform
      |
      v
Identity and key verification
      |
      v
Discovery / routing / authorization -----> Risk decision API
      |                                          ^
      v                                          |
Tool execution --------------------------> Signed receipt ledger
                                                 |
                                                 v
                              Reputation and risk projections
```

The existing directory, MCP server, and gateway become consumers and producers
of this core. They are the first integration surface and provide initial
traffic, but the identity, receipt, and decision APIs must also work for
executions that do not pass through the 404.directory gateway.

The first implementation will use Postgres append-only records, versioned JSON
schemas, and standard public-key signatures. A blockchain, token, or custom
consensus network is not required.

## Security and integrity requirements

- Internal calls, health checks, crawlers, probes, and anonymous traffic never
  build Agent reputation.
- Each accepted receipt is idempotent, nonce-protected, schema-validated, and
  signature-verified.
- Identity keys can be rotated and revoked without deleting historical facts.
- Counterparty identities and attestations are verified; a provider cannot
  create unlimited trusted evidence by claiming its own success.
- Reputation weighting accounts for time, verified counterparty diversity, and
  correlated identities to reduce Sybil amplification.
- Raw prompts, arguments, results, and credentials are excluded by design.
- Risk decisions record the policy version and reason codes used at decision
  time so they can be audited and recalibrated.

## Delivery sequence

1. Define versioned identity and receipt schemas plus the threat model.
2. Implement Agent identity registration, challenge verification, key rotation,
   and revocation.
3. Implement the append-only receipt ledger and signature verification.
4. Make every qualifying call through the existing gateway emit a verified
   receipt and associate it with a decision ID.
5. Add separate Agent, tool, provider, and capability reputation projections.
6. Add a contextual risk decision API and expose it as an MCP tool.
7. Recruit external relying parties that call the risk API or submit
   independently signed receipts.
8. Consider payments, disputes, limits, and financial credit only after the
   evidence layer has real adoption and a legal/compliance review.

## Success measures

- 1,000 deduplicated external Agent identities with at least one independently
  verified successful execution receipt.
- Number and diversity of verified Agents, tools, providers, and relying
  parties—not anonymous requests or page views.
- Repeat successful use across different counterparties and capabilities.
- Percentage of eligible external executions producing valid receipts.
- Number of external systems using a 404.directory risk decision in production.
- Risk calibration, override rate, false-positive rate, and incident rate by
  policy version.

## Non-goals

- Becoming a larger marketing directory by adding unverified listings.
- Building a social profile or universal social credit score for Agents.
- Storing prompts, tool inputs, tool outputs, or secrets for analytics.
- Issuing loans, holding funds, or selling a token in the initial phases.
- Replacing model marketplaces, MCP clients, identity providers, or payment
  processors.

## Consequences

### Positive

- Every verified execution can improve a shared cross-platform evidence graph.
- Tools, Agents, and relying parties create a multi-sided network effect.
- Large vendors can reproduce a directory, but a neutral history accepted by
  many independent counterparties is slower to replace.
- Privacy boundaries become part of the product rather than a later patch.

### Negative

- Adoption is harder because value requires both evidence producers and relying
  parties.
- Key management, revocation, anti-Sybil controls, and risk calibration add
  substantial security work.
- A risk decision creates higher reliability expectations than a directory
  recommendation.
- The current gateway remains necessary for distribution even though it is no
  longer the strategic center.
