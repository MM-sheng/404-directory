# Cursor Marketplace submission

Use the official publisher form at `https://cursor.com/marketplace/publish`.
The form requires a signed-in Cursor publisher account and acceptance of the
Cursor Marketplace Publisher Terms.

## Source

- GitHub repository: `https://github.com/MM-sheng/404-directory`
- Review tag: `v0.10.0`
- Format: Agent Plugins 1.0
- Manifest: `plugin.json`
- MCP configuration: `mcp.json`
- Agent Skill: `skills/use-404-directory/SKILL.md`
- License: `MIT`

## Listing copy

**Name:** 404.directory

**Short description:** Preflight Polymarket and unfamiliar Agent-tool actions
before an Agent acts.

**Long description:** 404.directory gives Cursor Agents one public, no-account
risk preflight for an exact Polymarket market or unfamiliar third-party tool.
It returns evidence-backed allow, review, or block decisions and never predicts,
trades, signs, accesses a wallet, or places an order. Official documentation
search, deployment verification, and webpage understanding remain supporting
workflows. The bundled Skill requires a useful non-error result before success.

**Category:** Developer tools

**Homepage:** `https://404.directory/docs`

**Logotype:** `https://404.directory/icon.svg`

**Support:** `https://404.directory/support`

**Privacy policy:** `https://404.directory/privacy`

**Terms:** `https://404.directory/terms`

## Data and security notes

- No account, API key, or user secret is required.
- The package exposes 16 MCP tools through the fixed
  `https://404.directory/mcp` origin. Evaluation tools are read-only; bounded
  receipt and outcome-report tools append privacy-safe records.
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
- The MCP Registry publishes `io.github.MM-sheng/404-directory` at `v0.10.0`.
- The release gate verifies the 16-tool inventory, first prediction-market
  call, persistent identity, and bounded documentation results.

## Suggested review prompts

1. Before I act, evaluate this exact Polymarket market for settlement and
   execution risk without predicting or trading.
2. Before I install this unfamiliar MCP tool, return an evidence-backed allow,
   review, or block decision.
3. Search current official OpenAI documentation for this concrete API question
   and cite first-party sources.
