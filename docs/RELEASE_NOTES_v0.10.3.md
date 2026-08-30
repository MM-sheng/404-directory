# v0.10.3 — Verified Agent Evidence v1

## Purpose

This release separates installation-ID activity from evidence of independently
operated external AI Agents. It prevents probes, copied IDs, command-line
checks, internal verification, anonymous traffic, failures, and admissions
without execution from being presented as progress toward the 1,000-Agent
target.

## New verified evidence path

- `GET /v1/metrics/verified-agents` is the authoritative adoption metric.
- An Agent counts only when an active evidence admission matches at least one
  successful, external, explicit tool invocation.
- `POST /v1/pilot/verified-agents` admits evidence with the registry admin
  token. Provider API keys cannot use this route.
- `DELETE /v1/pilot/verified-agents/:id` revokes an admission immediately.
- Agent installation IDs, operator IDs, and evidence references are persisted
  only as domain-separated HMAC digests.
- Agent installations and independent operators are de-duplicated separately.

## Honest diagnostic boundary

- `GET /v1/metrics/agents` remains available for unverified installation
  diagnostics but no longer exposes a target or progress ratio.
- The homepage, evidence dashboard, `llms.txt`, connection guide, pilot status
  script, and growth runbooks now direct adoption claims to the verified metric.
- Existing production installation IDs are not retroactively admitted.

## Persistence

Migration `0009_verified_agent_evidence` creates the additive
`verified_agent_admissions` table and supporting indexes. No existing table or
row is deleted or rewritten.

## External integration progress

The optional fail-open shadow preflight implementation for
`demwick/polymarket-agent-mcp` is available in upstream pull request
[#97](https://github.com/demwick/polymarket-agent-mcp/pull/97). A pull request,
merge, install, or test never counts as adoption; only an independently admitted
Agent with a matching successful production invocation qualifies.
