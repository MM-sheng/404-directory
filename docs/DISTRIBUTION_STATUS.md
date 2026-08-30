# Distribution status

Last audited: 2026-08-30 04:33 UTC

This tracker separates a submission from a public listing and a public listing
from a qualified external Agent. A channel is successful only after it produces
at least one de-duplicated external Agent with a successful tool execution.

## v0.10.3 production release (2026-08-30)

404.directory v0.10.3 is live on Cloud Run revision
`directory-404-v0103-f974214`, serving 100% of production traffic. The release
adds evidence-backed admission for independent Agent installations and
operators, an authoritative verified-Agent metric, privacy-safe HMAC evidence
digests, revocation, retention, and a hard separation between verified progress
and unverified traffic diagnostics.

Release evidence:

- GitHub Release: `v0.10.3` from merge commit `f974214`;
- npm: `@mmvv1638/404-directory-mcp@0.10.3` is `latest`;
- Official MCP Registry: `io.github.MM-sheng/404-directory` v0.10.3 is active
  and latest;
- publish workflow run `33292749936` passed both npm and Registry jobs;
- production migration, Cloud Run canary, canonical-domain MCP handshake,
  16-tool discovery, three real read-only tool calls and first-shot activation
  passed;
- the previous v0.10.2 revision remains at 0% as a rollback target.

At the audit timestamp, the authoritative metric is 0 verified external Agents,
0 verified operators and 0 qualifying invocations. The separate unverified
diagnostic is 2 installation ID digests, 15 successful invocations and 33
anonymous successes. Those diagnostic values do not count toward the
1,000-Agent target.

## v0.10.2 production release (2026-08-29)

404.directory v0.10.2 is live on Cloud Run revision
`directory-404-v0102-7ce485a`, serving 100% of production traffic. The release
aligns the homepage, REST discovery, MCP `tools/list`, installation guides and
plugin manifests to the same 16-tool service manifest; separates identified
external Agent activity from anonymous and internal traffic; improves catalog
search recall; and makes prediction-market evidence freshness fail closed.

Release evidence:

- GitHub Release: `v0.10.2` from merge commit `7ce485a`;
- npm: `@mmvv1638/404-directory-mcp@0.10.2` is `latest`;
- Official MCP Registry: `io.github.MM-sheng/404-directory` v0.10.2 is public;
- Cloud Run canary, canonical-domain MCP handshake, 16-tool discovery, three
  real read-only tool calls, first-shot activation and prediction-market
  preflight all passed before or immediately after cutover;
- the previous v0.10.1 revision remains at 0% as a rollback target.

At the audit timestamp, the strict public metric reports 2 identified Agent
IDs with 15 successful external-classified invocations, 22 anonymous successful
invocations and 0 later-day repeat Agents. These are measurement results, not a
claim that two independent production users have been validated.

## v0.10.1 release note (2026-08-27)

404.directory v0.10.1 makes the first installed-Agent interaction match the
vertical product: evidence-backed Polymarket and third-party tool risk
preflight. It also adds TypeScript and Python middleware for repeat use at an
Agent's existing execution boundary.

It evaluates public rules, time boundaries, subjective language, order-book
depth, spread, estimated slippage, caller-observed geographic eligibility, and
execution mode.

It does not predict outcomes, recommend trades, place orders, access wallets,
or custody funds.

## First-party release surfaces

| Surface               | Current public state                                                                                                                      | Prepared state                                                              | Next action                                                                                    | Blocker                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| GitHub                | v0.10.3 release published from `f974214`; v0.10.1 TypeScript v0.1.0 tarball and Python v0.1.0 wheel remain available with SHA-256 digests | Application release and SDK artifacts passed their respective release gates | Use the production MCP service and SDK artifacts for the first verified-Agent pilot            | None                                                                                                                 |
| npm MCP bridge        | `@mmvv1638/404-directory-mcp@0.10.3` is the public `latest` version                                                                       | Identity-preserving bridge matches `server.json`                            | Measure verified successful calls, not downloads                                               | None                                                                                                                 |
| npm risk SDK          | Release tarball is public; registry package is not initialized                                                                            | Trusted-publishing workflow prepared                                        | Owner performs the one-time npm package initialization, then run `Publish risk SDKs` on `main` | npm local authentication is expired and npm requires an existing package before trusted publishing can be configured |
| PyPI risk SDK         | Release wheel is public; `directory404-risk` is not registered                                                                            | Trusted-publishing workflow prepared                                        | Owner creates a pending PyPI publisher for `publish-risk-sdks.yml`, then run it on `main`      | One-time PyPI account configuration                                                                                  |
| Official MCP Registry | `io.github.MM-sheng/404-directory` v0.10.3 is active and latest                                                                           | 16 MCP tools on production                                                  | Measure Registry-attributed verified successful calls                                          | None                                                                                                                 |
| Production            | Cloud Run revision `directory-404-v0103-f974214` serves 100% of traffic with v0.10.3 and 16 MCP tools                                     | `directory-404-v0102-7ce485a` remains available at 0% for rollback          | Recruit and verify the first 10 independent Agents                                             | None                                                                                                                 |

## Marketplace and directory surfaces

| Channel                     | Evidence checked                                                                                                | State                                                                                                                                                                             | Next action                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cursor Marketplace          | Signed-in publisher form accepted the public project fields, owner-approved contact address and Publisher Terms | Submitted on 2026-08-24; Cursor displayed “Thanks for applying”                                                                                                                   | Wait for review email; after listing, run one external Cursor task and measure the Cursor source label                                                  |
| Claude Connectors Directory | Official process re-audited against current Anthropic documentation                                             | Not submitted; the old remote form is deprecated and the open Google form is for local MCPB extensions                                                                            | Use the Claude.ai organization portal as a remote MCP connector; requires Team/Enterprise plus Directory management access                              |
| MCP.Directory               | Submission page reported that the repository was already submitted                                              | In review queue, not proof of public listing                                                                                                                                      | Do not resubmit; check listing after the review window                                                                                                  |
| IndexMCP                    | Free no-login form and documented submit API were tried without optional email                                  | Not submitted; both the form and `.co` API return a provider-side schema-cache error because the `submissions.category` column is missing; documented `.com` endpoint returns 404 | Recheck only after IndexMCP fixes its backend; do not claim a submission or keep retrying the broken endpoint                                           |
| mcpservers.org              | Public form inspected and valid public fields prepared                                                          | Not submitted                                                                                                                                                                     | Owner supplies/approves contact email and confirms the representational submission                                                                      |
| GitHub MCP Registry         | Not found in public discovery during this audit                                                                 | Nomination not sent                                                                                                                                                               | Owner approves the official nomination email; measure Copilot/CLI attribution against v0.10.0                                                           |
| Glama                       | Public connector is Healthy but still exposes the old two-tool snapshot                                         | Listed with stale metadata; production exposes 16 tools                                                                                                                           | Claiming requires publishing a maintainer email that matches a Glama account; obtain owner approval before exposing it, then request/rescan the listing |

## Open upstream pull requests

| Channel                    | Pull request                                                                                             | State on 2026-08-23                                                    | Blocker/next action                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Cline Marketplace          | [#55](https://github.com/cline/marketplace/pull/55), [#56](https://github.com/cline/marketplace/pull/56) | Open, mergeable, review required                                       | Maintainer review                                                       |
| OpenModels MCP             | [#14](https://github.com/openmodelsrun/mcp/pull/14)                                                      | Open, clean, mergeable                                                 | Maintainer review                                                       |
| Docker MCP Registry        | [#4752](https://github.com/docker/mcp-registry/pull/4752)                                                | Open, mergeable, review required                                       | Maintainer review                                                       |
| ToolSDK Registry           | [#467](https://github.com/toolsdk-ai/toolsdk-mcp-registry/pull/467)                                      | Open, clean; schema and Biome checks pass                              | Maintainer merge                                                        |
| Awesome Remote MCP         | [#97](https://github.com/sylviangth/awesome-remote-mcp-servers/pull/97)                                  | Open, mergeable, unstable status                                       | Maintainer review/status resolution                                     |
| Awesome MCP Servers        | [#12608](https://github.com/punkpeye/awesome-mcp-servers/pull/12608)                                     | Open, clean; automated submission checks pass                          | Glama badge request; hosted connector exception requested               |
| Awesome Remote MCP (jaw9c) | [#638](https://github.com/jaw9c/awesome-remote-mcp-servers/pull/638)                                     | Open, clean, mergeable                                                 | Maintainer review                                                       |
| Awesome Agent Skills       | [#435](https://github.com/heilcheng/awesome-agent-skills/pull/435)                                       | Open, mergeable; Vercel check fails                                    | Upstream Vercel team authorization                                      |
| ZeroClaw Skills            | [#21](https://github.com/zeroclaw-labs/zeroclaw-skills/pull/21)                                          | Open, mergeable, blocked                                               | Maintainer review                                                       |
| MCPfinder                  | [#9](https://github.com/mcpfinder/mcpfinder/pull/9)                                                      | Open, mergeable, review required                                       | Maintainer review and upstream deployment secret                        |
| TensorBlock                | [#1910](https://github.com/TensorBlock/awesome-mcp-servers/pull/1910)                                    | Merged on 2026-08-23                                                   | Verify public listing attribution and wait for qualified external usage |
| MCPM package manager       | [#379](https://github.com/pathintegral-institute/mcpm.sh/pull/379)                                       | Open, mergeable; manifest validation, lint and test checks pass        | Maintainer review; after merge measure source `mcpm`                    |
| Awesome MCP ZH             | [#495](https://github.com/yzfly/Awesome-MCP-ZH/pull/495)                                                 | Open; one Chinese Search-category entry with executable npm install    | Maintainer review; after merge measure source `awesome-mcp-zh`          |
| Awesome MCP Servers DevOps | [#72](https://github.com/WagnerAgent/awesome-mcp-servers-devops/pull/72)                                 | Open, clean and mergeable; deployment verification and discovery entry | Maintainer review; after merge measure source `awesome-mcp-devops`      |

## Additional directory actions

- The v0.9.3 GitHub Release is public at
  `https://github.com/MM-sheng/404-directory/releases/tag/v0.9.3`; npm and the
  Official MCP Registry publish workflow passed for the same commit.
- A source-labelled submission was added to the canonical mcp.so intake issue.
- GitHub's public MCP Registry does not yet show 404.directory. A nomination
  email is prepared as an unsent draft and still requires owner review and
  explicit send authorization.
- MCPCentral already lists `io.github.MM-sheng/404-directory` at v0.9.0 and
  documents automatic synchronization from the Official MCP Registry; avoid a
  duplicate manual submission while v0.9.3 propagates.
- PulseMCP has paused new submissions. Smithery requires account
  authentication. The appcypher upstream repository is archived, so it cannot
  accept a new pull request.

A single v0.9.2 release-evidence update was posted to ten still-open listing or
skill PRs after production, npm and Official Registry publication were verified.
MCPfinder PR #9 did not receive a version comment because it is an upstream
ingestion-pipeline change and the release version does not affect its review.
No repeat reminder will be posted without a maintainer question, state change or
new actionable result.

On 2026-08-24, three additional non-duplicate submissions were selected for
executable installation or high-relevance discovery rather than raw listing
volume. No submission was made to static mirrors, low-signal bot backlogs, or
channels without a path to accept an executable MCP server. MCPM installs the
public npm bridge with `--source mcpm`, which creates and preserves a random
non-personal Agent ID. The two curated lists publish source-labelled npm
commands. Views, stars, PR merges and installation attempts remain diagnostic
only.

## Vertical repeat-use acquisition

The first v0.10.1 acquisition batch targets existing prediction-market
execution paths instead of general MCP directories:

- [Awesome Prediction Market Tools #194](https://github.com/aarora4/Awesome-Prediction-Market-Tools/pull/194)
  adds one bounded, open-source Agent entry and is awaiting review;
- [BlockRunAI/polymarket-agent #5](https://github.com/BlockRunAI/polymarket-agent/issues/5)
  proposes an optional Python `shadow` preflight at its live CLOB boundary;
- [demwick/polymarket-agent-mcp #96](https://github.com/demwick/polymarket-agent-mcp/issues/96)
  led to the complete, tested
  [shadow preflight implementation #97](https://github.com/demwick/polymarket-agent-mcp/pull/97),
  now awaiting maintainer review.

These actions are prospects, not usage. The verified baseline is 0 external
Agents, 0 independent operators and 0 later-day repeat Agents. The separate
unverified diagnostic is 2 installation IDs and 15 successful invocations;
neither ID has independent-operator evidence. No listing, issue, pull request,
install, or internal smoke test changes the verified numbers.

## Measurement rule after acceptance

Every install surface must use a distinct safe source label. Review status,
listing count, page views and health probes remain diagnostic only. Keep a
channel only when `/v1/metrics/verified-agents` shows a qualified Agent for that source;
pause it after two complete seven-day experiments with none.
