# Claude Connectors Directory submission

404.directory is an internet-hosted Streamable HTTP MCP server. Submit it as a
**remote MCP connector**, not as a local MCPB desktop extension.

## Current official path

Anthropic's current submission portal is inside a Team or Enterprise
organization's settings on Claude.ai:

- New submission: `https://claude.ai/admin-settings/directory/submissions/new`
- Submission dashboard: `https://claude.ai/admin-settings/directory/submissions`
- Official instructions: `https://claude.com/docs/connectors/building/submission`

The submitter needs Directory management access. Owners and Primary Owners have
it by default; an Enterprise Owner can also grant the Directory or Libraries
permission through a custom role. Team plans do not support this delegation.

The former remote MCP Google form is deprecated and no longer accepts
responses. `https://platform.claude.com/plugins/submit` currently leads to the
separate MCPB desktop-extension intake and is not the correct path for this
hosted service.

## Connection

- MCP URL: `https://404.directory/mcp`
- Transport: Streamable HTTP
- Authentication: None
- URL model: Every user connects to the same URL
- Tools: 12 read-only MCP tools

The portal synchronizes tool metadata from the live server. Before submitting,
confirm that every tool displays a title and the correct `readOnlyHint` and
`destructiveHint` annotations.

## Listing copy

**Name:** 404.directory

**Tagline:** Trusted read-only tools for AI agents

**Description:** 404.directory gives Claude one public, no-account MCP endpoint
for current OpenAI, Microsoft Learn, AWS, and Cloudflare documentation search;
structured public deployment verification; webpage understanding; and
trust-aware discovery of approved read-only MCP tools.

**Categories:** Developer tools; Productivity

**Documentation:** `https://404.directory/docs`

**Homepage:** `https://404.directory`

**Support:** `https://404.directory/support`

**Privacy policy:** `https://404.directory/privacy`

**Terms:** `https://404.directory/terms`

## Review notes

- No account, API key, secret, or test credential is required.
- The service exposes 12 read-only MCP tools at one fixed HTTPS origin.
- The server rejects private, loopback, link-local, metadata-service, and
  credential-bearing URL targets.
- Adoption telemetry stores only source/client labels and an optional HMAC of a
  random installation ID after successful external use. It stores no raw Agent
  IDs, prompts, arguments, results, IP addresses, emails, or usernames.
- The production server and public npm bridge are both version `0.9.3`.

## Suggested review prompts

1. Search current official OpenAI documentation for remote MCP servers and cite
   the source.
2. Verify that `https://404.directory/health` returns HTTP 200 and contains the
   release string `0.9.3`.
3. Find a trusted read-only MCP tool for deployment verification and explain
   the trust dimensions used.

## Separate Claude Code plugin distribution

The source at
`https://github.com/MM-sheng/404-directory/tree/v0.9.3/distribution/404-directory`
remains valid for direct Claude Code plugin installation and validation. It is
not a substitute for the Claude Connectors Directory submission, and it should
not be uploaded to the MCPB desktop-extension form.
