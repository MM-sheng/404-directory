# Privacy-safe telemetry and retention

## Purpose

404.directory records the minimum evidence needed to answer three questions:

1. Did a real external Agent successfully use a tool?
2. Where does installation or activation fail?
3. How reliable are a tool, registered provider, client and source over time?

The system does not record task content for analytics.

## Allowed fields

Invocation events may contain only:

- irreversible Agent ID HMAC, when the client supplied a stable random ID;
- irreversible MCP session HMAC, when a session exists;
- request ID;
- safe client and attribution-source labels;
- external, internal or anonymous classification;
- tool, registered provider and version identifiers;
- start/completion timestamps and latency;
- success or a finite canonical error type;
- bounded result-item count;
- event creation time.

Activation events may contain only stage, source, safe client label, optional
Agent HMAC, identity kind, external classification and time.

The activation summary derives `tool_attempt`, `successful_tool`, and
`failed_tool` stages from the same invocation records. It does not create a
second copy of tool-call data. Per source it reports:

- call rate: identified Agents with any tool attempt / identified initialized
  Agents;
- tool success rate: identified Agents with a success / identified Agents with
  any attempt;
- activation rate: identified Agents with a success / identified initialized
  Agents.

These ratios diagnose where activation stops. Only the successful numerator is
eligible for the public Agent target.

## Prohibited fields

Product analytics must never store or expose:

- raw Agent IDs;
- raw MCP session IDs;
- IP addresses;
- email, username, hostname or device name as identity;
- prompts or task text;
- tool arguments;
- tool result content;
- API keys, cookies, authorization headers or other credentials.

Infrastructure security logs can contain standard request metadata and client
IP under the hosting provider's retention policy, but application logs must not
include request bodies.

## Metric admission

A qualified Agent requires an explicit, privacy-safe Agent HMAC, external
classification and at least one successful tool execution. Internal clients,
known scanners, release smoke, probes, anonymous traffic and duplicates do not
count.

Anonymous external calls can contribute to aggregate reliability evidence but
never to the unique-Agent target or Agent retention.

## Retention definitions

- `repeat_agents_on_later_day`: qualified Agents with another successful call
  on a different UTC calendar day.
- 7-day retention: the first success is at least seven complete days old and a
  later-day success occurred within seven days of the first.
- 30-day retention: the same rule with a 30-day complete observation window.
- Agents whose observation window is incomplete are excluded from the
  denominator, not treated as churned.

## Reliability definitions

`GET /v1/metrics/reliability?days=30` returns external execution aggregates by:

- tool and version;
- registered provider;
- safe client label;
- attribution source;
- canonical error type.

Every aggregate includes sample size, successes, success rate, identified-Agent
count, anonymous invocation count, result-item count, P50/P95 latency and last
observation time. It is evidence with a time window and sample size, not an
absolute trust score.

## Storage period

The default analytics retention period is 400 days. This preserves enough
history to de-duplicate a full calendar-year target while limiting indefinite
storage. A deployment may choose a longer period from 365 to 3,650 days only
after documenting the reason.

`npm run data:retention:report` is read-only and reports expired row counts.
Deletion is disabled by default. A human operator must inspect the cutoff and
backup/recovery state, then explicitly run the script with `--execute` and the
documented confirmation value. Production deletion is a high-risk operation and
is never performed by autonomous maintenance.

## Integrity and change control

- Invocation, activation and usage-receipt records are append-only during
  normal product operation.
- Aggregates are derived and can be recomputed from retained events.
- Internal and external classifications remain separate at write and query
  time.
- Error values are normalized to a finite taxonomy before persistence; raw
  exception text is not an analytics dimension.
- Metric definitions and the HMAC prefix are versioned.
- HMAC salt rotation requires a documented cutover because it intentionally
  breaks cross-key deduplication. Keep the old aggregate snapshot; never retain
  raw IDs to bridge rotations.
- Changes to admission or retention rules require tests and a dated note in the
  execution report.
