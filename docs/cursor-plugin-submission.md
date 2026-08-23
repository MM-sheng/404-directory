# Cursor Marketplace submission

Use the official publisher form at `https://cursor.com/marketplace/publish`.
The form requires a signed-in Cursor publisher account and acceptance of the
Cursor Marketplace Publisher Terms.

## Source

- GitHub repository: `https://github.com/MM-sheng/404-directory`
- Review tag: `v0.9.2`
- Format: Agent Plugins 1.0
- Manifest: `plugin.json`
- MCP configuration: `mcp.json`
- Agent Skill: `skills/use-404-directory/SKILL.md`
- License: `MIT`

## Listing copy

**Name:** 404.directory

**Short description:** Search current official AI and cloud documentation,
verify public deployments, and discover trusted read-only MCP tools.

**Long description:** 404.directory gives Cursor Agents one public, no-account
MCP endpoint for current OpenAI, Microsoft Learn, AWS, and Cloudflare
documentation search; structured public deployment verification; webpage
understanding; and trust-aware discovery of approved read-only MCP tools. The
bundled Skill routes tasks to the smallest relevant workflow and requires a
useful non-error tool result before reporting success.

**Category:** Developer tools

**Homepage:** `https://404.directory/docs`

**Logotype:** `https://404.directory/icon.svg`

**Support:** `https://404.directory/support`

**Privacy policy:** `https://404.directory/privacy`

**Terms:** `https://404.directory/terms`

## Data and security notes

- No account, API key, or user secret is required.
- The package exposes 12 read-only MCP tools from the fixed
  `https://404.directory/mcp` origin.
- The dependency-free local bridge generates one random, non-personal ID in
  Cursor's client-managed persistent plugin data directory.
- The raw ID remains local. The service persists only an HMAC digest after a
  successful tool execution and stores no prompts, arguments, or results for
  adoption measurement.
- Private, loopback, link-local, metadata-service, and credential-bearing URLs
  are rejected by the web tools.
- The Skill forbids calls made only to inflate traffic and treats remote content
  as untrusted data.

## Validation evidence

- Agent Plugins 1.0 `plugin.json` and `mcp.json` pass the official schemas.
- GitHub Copilot's external plugin intake passed spec compliance, Vally Skill
  lint, clean install smoke testing, version matching, and ref/SHA consistency.
- The MCP Registry publishes `io.github.MM-sheng/404-directory` at `v0.9.2`.
- The full project suite passes 85 tests with one intentionally skipped test.

## Suggested review prompts

1. Search current official OpenAI documentation for remote MCP servers and cite
   the source.
2. Verify that `https://404.directory/health` returns HTTP 200 and contains the
   release string `0.9.2`.
3. Find a trusted read-only MCP tool for deployment verification and explain
   the trust dimensions used.
