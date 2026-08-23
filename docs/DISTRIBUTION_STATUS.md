# Distribution status

Last audited: 2026-08-23 UTC

This tracker separates a submission from a public listing and a public listing
from a qualified external Agent. A channel is successful only after it produces
at least one de-duplicated external Agent with a successful tool execution.

## First-party release surfaces

| Surface | Current public state | Prepared state | Next action | Blocker |
| --- | --- | --- | --- | --- |
| GitHub PR #5 | Draft, mergeable, CI passing | v0.9.2 code and metadata | Owner enables npm Trusted Publisher, then make Ready/merge | Login, terms and irreversible release actions |
| npm | v0.9.0 public | Local v0.9.2 package validates and installs cleanly | Publish through GitHub OIDC after merge/tag | Trusted Publisher must be configured by Owner |
| Official MCP Registry | v0.9.1 latest | `server.json` validates against the live Registry | Publish v0.9.2 after npm propagation | Depends on merge, tag and npm publish |
| Production | Cloud Run v0.9.1 | v0.9.2 service, web and container builds validated locally | Backup, migrate, canary and deploy | Production mutation intentionally not autonomous |

## Marketplace and directory surfaces

| Channel | Evidence checked | State | Next action |
| --- | --- | --- | --- |
| Cursor Marketplace | Previously submitted; account-gated form | Review/public status not independently visible | Owner checks account dashboard after v0.9.2 release; update evidence without duplicate submission |
| Claude Plugin Directory | Previously submitted; account-gated form | Review/public status not independently visible | Owner checks account dashboard after v0.9.2 release |
| MCP.Directory | Submission page reported that the repository was already submitted | In review queue, not proof of public listing | Do not resubmit; check listing after the review window |
| mcpservers.org | Public form inspected and valid public fields prepared | Not submitted | Owner supplies/approves contact email and confirms the representational submission |
| GitHub MCP Registry | Not found in public discovery during this audit | Nomination not sent | After v0.9.2, Owner approves the official nomination email; measure Copilot/CLI attribution |
| Glama | Connector page reachable; requested score badge URL returned 404 | Listed, badge evidence unavailable | Ask for a hosted-connector exception; do not invent a badge |

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
| TensorBlock | [#1910](https://github.com/TensorBlock/awesome-mcp-servers/pull/1910) | Draft, mergeable, review required | Maintainer-owned branch and review |

No additional comments were posted during this audit because there was no new
maintainer question or actionable failure. Repeated status comments would add
noise without increasing the chance of a qualified Agent.

## Measurement rule after acceptance

Every install surface must use a distinct safe source label. Review status,
listing count, page views and health probes remain diagnostic only. Keep a
channel only when `/v1/metrics/agents` shows a qualified Agent for that source;
pause it after two complete seven-day experiments with none.
