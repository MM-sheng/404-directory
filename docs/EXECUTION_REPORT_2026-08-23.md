# Autonomous execution report — 2026-08-23

## Outcome

Status: **safe local scope accepted; full plan escalated**.

All reversible work that could be completed without production mutation,
account takeover, accepting terms, paid activity, secrets, fabricated traffic
or waiting for outside users has been implemented and tested. The release and
adoption plan is not complete: production remains v0.9.1, public npm remains
v0.9.0, and the strict adoption metric remains 1/1,000.

Tracking issue: <https://github.com/MM-sheng/404-directory/issues/6>

## Completed work

### Product and data foundation

- Added privacy-safe 7-day and 30-day qualified-Agent retention cohorts. An
  incomplete observation window is excluded from the denominator.
- Added external execution reliability aggregates by tool/version, provider,
  safe client label and attribution source, including sample size, identified
  Agents, anonymous calls, result count, success rate, P50/P95 latency, last
  observation and canonical error distribution.
- Added `GET /v1/metrics/reliability?days=1..90` and a no-store `/metrics`
  evidence dashboard combining the strict target, retention, activation and
  reliability views.
- Added activation rate and safe-client breakdowns to existing growth metrics.
- Normalized persisted invocation errors to a finite taxonomy. Raw exception
  messages are not retained as an analytics dimension.
- Added a default 400-day analytics retention policy and a dry-run-only report.
  Deletion requires an explicit execute flag and exact confirmation value.
- Expanded the public privacy explanation: no raw Agent/session ID, prompt,
  arguments, result content or raw IP is stored in product analytics.
- Preserved the single Fastify/Postgres architecture. No microservice, vector
  database, blockchain, payment, insurance or speculative identity layer was
  introduced.

### Installation and operating evidence

- Validated a freshly packed v0.9.2 npm bridge in a new temporary npm project.
  It initialized, listed exactly 12 tools, reused the client-scoped identity on
  a second process and returned the expected `search_tools` result.
- Validated production Streamable HTTP with the MCP SDK: initialize,
  `notifications/initialized`, 12-tool listing, `verify_web`, Microsoft
  `search_official_docs`, catalog search, curated-provider inspection and
  allowlisted OpenAI documentation invocation.
- Confirmed all release-smoke calls were classified internal: the public strict
  metric was 1 before and 1 after validation.
- Added a dated client acceptance matrix, first-use task, finite failure record,
  non-sensitive evidence template, telemetry/retention specification, weekly
  growth runbook and distribution status tracker.
- Corrected the Next.js TypeScript boundary so the web build strictly checks
  the web application while the service remains checked by
  `tsconfig.service.json`; type errors are not ignored.

### Distribution audit

- Rechecked PR #5 and all known upstream directory PRs. PR #5 is draft,
  mergeable and has a passing CI check. There was no unanswered maintainer
  request that could be actioned safely.
- Recorded Cursor, Claude, MCP.Directory, mcpservers.org, GitHub Registry,
  Glama and upstream PR state in `docs/DISTRIBUTION_STATUS.md`.
- Did not resubmit MCP.Directory after it reported that the repository was
  already in review, and did not spam unchanged upstream PRs.

## Verified results

| Check | Result |
| --- | --- |
| PostgreSQL-backed test suite | 23 files, 110 tests passed |
| ESLint | Passed with zero warnings |
| Service typecheck and build | Passed |
| Next.js production build | Passed; all static/dynamic routes generated |
| Diff whitespace check | Passed |
| Package dry-run | v0.9.2, 4 files, package metadata correct |
| Official Registry manifest | Live `mcp-publisher validate` passed |
| Production dependency audit | `npm audit --omit=dev`: 0 vulnerabilities |
| Retention report | Dry-run, 400 days, zero expired rows in the test database |
| Local HTTP service | `/health`, strict metrics, reliability API and `/metrics` all returned 200 |
| Docker compilation stage | `docker build --target build` passed |
| Fresh stdio package | Initialize, 12 tools, stable identity reuse and `search_tools` passed |
| Production MCP smoke | 12 tools, `verify_web`, Microsoft docs and catalog search passed |
| Production gateway smoke | OpenAI provider discovered, inspected and invoked successfully |
| Strict metric integrity | 1 Agent / 6 attributable successes before and after internal smoke |
| Public production version | v0.9.1, healthy, 12 tools |
| Public npm version | v0.9.0 |
| Official MCP Registry latest | v0.9.1, active |

The test database contains synthetic PostgreSQL evidence from the test suite.
It is isolated from production and is not adoption evidence.

## Skipped items, reasons and impact

| Skipped item | Reason | Impact |
| --- | --- | --- |
| Configure npm Trusted Publisher | Requires Owner login, identity verification and possible terms acceptance | v0.9.2 cannot be released through the intended OIDC path |
| Make PR #5 Ready, merge it and push tag `v0.9.2` | Merge/tag/release are irreversible production-facing actions excluded by the task safety boundary; OIDC prerequisite is unverified | Code remains on the feature PR; workflows do not publish |
| Publish npm v0.9.2 and Official Registry v0.9.2 | Depends on Trusted Publisher, merge and tag | Public clients still receive npm v0.9.0 and Registry v0.9.1 |
| Production database migration and Cloud Run rollout | Requires backup/recovery confirmation and mutates production | New metrics/dashboard and v0.9.2 telemetry are not live |
| Full final Docker runtime image | Three attempts: normal build stalled on a 111 MiB Playwright CDN download; build-stage fallback passed; host-network retry stalled at the same download | Compilation is proven, but the final image layer and container health check must be rerun in CI or a faster network |
| Real Cursor, Claude and Codex clean-profile acceptance | Requires external applications/accounts and user-owned client state | Automated protocol/package evidence exists; named-client compatibility cannot be claimed as externally accepted |
| Submit mcpservers.org form | Browser inspection prepared public fields, but submission is representational and the contact email is sensitive; action-time approval/contact value was unavailable and questions were forbidden | One optional directory remains unsubmitted |
| Check account-only Cursor/Claude submission status | Requires logged-in owner dashboards | Public review/listing state remains unknown |
| GitHub MCP Registry nomination email | External representational communication requires Owner approval and no authorized email channel was available | GitHub discovery is not advanced in this run |
| Glama score badge | Public badge URL for the hosted connector returned 404 | One upstream directory PR awaits a hosted-connector exception; no badge was fabricated |
| Automatic `install_failed`, `initialize_failed` and `tools_list_failed` collection | A server cannot observe a failure before connection; adding client-side failure reporting without pilot evidence would add product telemetry and consent scope | These remain finite acceptance/runbook labels; automatic early-stage diagnosis is incomplete |
| Apply analytics deletion | Destructive operation; dry-run showed zero expired rows | No impact now; deletion path remains intentionally operator-gated |
| First 10/50/100/300/600/1,000 external Agents and 7/30-day cohorts | Requires elapsed time and independent real users; generating project-owned IDs would be fake growth | Annual adoption goal remains 1/1,000 and retention has no eligible production cohort |
| Signed receipts, cross-client identity, risk, credit and insurance layers | Explicitly gated until at least 100 qualified Agents and useful multi-client evidence | No premature trust-platform claims; long-term layer remains a hypothesis |

## How to complete the skipped work

1. The Owner configures the npm Trusted Publisher for repository
   `MM-sheng/404-directory`, workflow `publish-mcp.yml`, with no environment.
2. Re-run the complete validation table in CI, including a full Docker image
   build where Playwright CDN bandwidth is adequate.
3. Review PR #5, make it Ready and merge only after checking the production
   database recovery point.
4. Push tag `v0.9.2`; verify npm first, then Official MCP Registry, and retain
   the publish-workflow evidence.
5. Back up production, apply migrations, deploy a canary Cloud Run revision,
   repeat both internal smokes, confirm the strict metric remains unchanged,
   then move traffic to 100%.
6. Run the dated matrix in clean Cursor, Claude and Codex profiles. Record only
   client/version, stage, request ID and outcome.
7. Recruit independent pilot users through uniquely labelled sources. Admit an
   Agent only after a successful real tool call; audit the first 10 individually.
8. At each eligible 7/30-day window, freeze the metric snapshot. Scale only a
   source that produces qualified and retained Agents.
9. Recheck account-only directories and make the mcpservers.org/GitHub
   representational submissions with explicit Owner control.
10. Revisit signed execution receipts only at the 100-Agent decision gate.

## Acceptance decision

The implemented local change set is accepted for review because all applicable
tests pass and the remaining gaps are external, high-risk, time-dependent or
account-dependent. The overall execution plan is escalated rather than marked
complete: releasing, deploying and acquiring 999 additional real external
Agents remain required outcomes.

## Post-report production lineage audit

At 2026-08-23 12:48 UTC, Cloud Run revision `directory-404-00036-wkw`
was built from a `gcloud`-uploaded local ZIP rather than GitHub `main` or a
release tag. The ZIP matches the uncommitted `/Users/m/privacy-ai-chat`
workspace and reports v0.9.2, while GitHub main, npm and the Official Registry
remain on older releases. It does not contain the reliability API/dashboard.

The uploaded source also contained an earlier version of migration `0005` that
created a raw `session_id` column. A read-only production audit found 106
invocation rows and zero non-null `session_id` values. Migration
`0006_session_key_privacy.sql` now additively creates the HMAC-only
`session_key` column for that already-migrated production lineage. The unused
legacy column is deliberately left in place until an explicitly approved
schema-cleanup window; current code neither reads nor writes it.
