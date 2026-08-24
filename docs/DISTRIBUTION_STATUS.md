# Distribution status

Last audited: 2026-08-24 11:16 UTC

This tracker separates a submission from a public listing and a public listing
from a qualified external Agent. A channel is successful only after it produces
at least one de-duplicated external Agent with a successful tool execution.

## First-party release surfaces

| Surface | Current public state | Prepared state | Next action | Blocker |
| --- | --- | --- | --- | --- |
| GitHub | v0.9.2 release tag exists; activation PRs #12-#14 and v0.9.3 preparation PR #15 are merged | v0.9.3 manifests and release code are on `main` at `0bd82e7` | Create the v0.9.3 tag only with action-time release authorization | Tag triggers npm and Official Registry publication |
| npm | v0.9.2 public | v0.9.3 package manifest and dry-run pack pass | Publish through the trusted workflow only after action-time tag authorization | v0.9.3 tag not created |
| Official MCP Registry | v0.9.2 public | v0.9.3 `server.json` matches the npm package version | Publish after npm through the tag workflow | v0.9.3 tag not created |
| Production | Cloud Run v0.9.2, 12 MCP tools | v0.9.3 service tests, typecheck, lint and build pass | Back up, deploy a canary, smoke test, then shift traffic only with production authorization | Production deployment not authorized |

## Marketplace and directory surfaces

| Channel | Evidence checked | State | Next action |
| --- | --- | --- | --- |
| Cursor Marketplace | Signed-in publisher form inspected; public fields prepared with the production icon and repository | Not submitted; Contact email is blank and Publisher Terms have not been accepted | Owner supplies/approves the contact email, reviews the Publisher Terms, and gives action-time confirmation before submission |
| Claude Connectors Directory | Official process re-audited against current Anthropic documentation | Not submitted; the old remote form is deprecated and the open Google form is for local MCPB extensions | Use the Claude.ai organization portal as a remote MCP connector; requires Team/Enterprise plus Directory management access |
| MCP.Directory | Submission page reported that the repository was already submitted | In review queue, not proof of public listing | Do not resubmit; check listing after the review window |
| mcpservers.org | Public form inspected and valid public fields prepared | Not submitted | Owner supplies/approves contact email and confirms the representational submission |
| GitHub MCP Registry | Not found in public discovery during this audit | Nomination not sent | After v0.9.2, Owner approves the official nomination email; measure Copilot/CLI attribution |
| Glama | Public connector is Healthy but still exposes the old two-tool snapshot | Listed with stale metadata; production exposes 12 tools | Claiming requires publishing a maintainer email that matches a Glama account; obtain owner approval before exposing it, then request/rescan the listing |

## Open upstream pull requests

| Channel | Pull request | State on 2026-08-23 | Blocker/next action |
| --- | --- | --- | --- |
| Cline Marketplace | [#55](https://github.com/cline/marketplace/pull/55), [#56](https://github.com/cline/marketplace/pull/56) | Open, mergeable, review required | Maintainer review |
| OpenModels MCP | [#14](https://github.com/openmodelsrun/mcp/pull/14) | Open, clean, mergeable | Maintainer review |
| Docker MCP Registry | [#4752](https://github.com/docker/mcp-registry/pull/4752) | Open, mergeable, review required | Maintainer review |
| ToolSDK Registry | [#467](https://github.com/toolsdk-ai/toolsdk-mcp-registry/pull/467) | Open, clean; schema and Biome checks pass | Maintainer merge |
| Awesome Remote MCP | [#97](https://github.com/sylviangth/awesome-remote-mcp-servers/pull/97) | Open, mergeable, unstable status | Maintainer review/status resolution |
| Awesome MCP Servers | [#12608](https://github.com/punkpeye/awesome-mcp-servers/pull/12608) | Open, clean; automated submission checks pass | Glama badge request; hosted connector exception requested |
| Awesome Remote MCP (jaw9c) | [#638](https://github.com/jaw9c/awesome-remote-mcp-servers/pull/638) | Open, clean, mergeable | Maintainer review |
| Awesome Agent Skills | [#435](https://github.com/heilcheng/awesome-agent-skills/pull/435) | Open, mergeable; Vercel check fails | Upstream Vercel team authorization |
| ZeroClaw Skills | [#21](https://github.com/zeroclaw-labs/zeroclaw-skills/pull/21) | Open, mergeable, blocked | Maintainer review |
| MCPfinder | [#9](https://github.com/mcpfinder/mcpfinder/pull/9) | Open, mergeable, review required | Maintainer review and upstream deployment secret |
| TensorBlock | [#1910](https://github.com/TensorBlock/awesome-mcp-servers/pull/1910) | Merged on 2026-08-23 | Verify public listing attribution and wait for qualified external usage |
| MCPM package manager | [#379](https://github.com/pathintegral-institute/mcpm.sh/pull/379) | Open, mergeable; manifest validation, lint and test checks pass | Maintainer review; after merge measure source `mcpm` |
| Awesome MCP ZH | [#495](https://github.com/yzfly/Awesome-MCP-ZH/pull/495) | Open; one Chinese Search-category entry with executable npm install | Maintainer review; after merge measure source `awesome-mcp-zh` |
| Awesome MCP Servers DevOps | [#72](https://github.com/WagnerAgent/awesome-mcp-servers-devops/pull/72) | Open, clean and mergeable; deployment verification and discovery entry | Maintainer review; after merge measure source `awesome-mcp-devops` |

## Additional directory actions

- A v0.9.2 GitHub Release now exists at
  `https://github.com/MM-sheng/404-directory/releases/tag/v0.9.2`.
- A source-labelled submission was added to the canonical mcp.so intake issue.
- GitHub's public MCP Registry does not yet show 404.directory. A nomination
  email is prepared as an unsent draft and still requires owner review and
  explicit send authorization.
- MCPCentral already lists `io.github.MM-sheng/404-directory` at v0.9.0 and
  documents automatic synchronization from the Official MCP Registry; avoid a
  duplicate manual submission while v0.9.2 propagates.
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

## Measurement rule after acceptance

Every install surface must use a distinct safe source label. Review status,
listing count, page views and health probes remain diagnostic only. Keep a
channel only when `/v1/metrics/agents` shows a qualified Agent for that source;
pause it after two complete seven-day experiments with none.
