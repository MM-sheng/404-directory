# Claude Plugin Directory submission

Use the official Console form at `https://platform.claude.com/plugins/submit`.
The submitter must be a Developer, Admin, or Owner of a Console organization.

## Source

- GitHub repository: `https://github.com/MM-sheng/404-directory`
- Review tag: `v0.8.5`
- Plugin manifest: `.claude-plugin/plugin.json`
- MCP configuration: `.claude-plugin/mcp.json`
- Agent Skill: `skills/use-404-directory/SKILL.md`
- License: `MIT`

## Listing copy

**Name:** 404.directory

**Description:** Search current official OpenAI, Microsoft Learn, AWS, and
Cloudflare documentation, verify public web deployments with structured
evidence, and discover trusted read-only MCP tools.

**Category:** Developer tools

**Homepage:** `https://404.directory/docs`

**Support:** `https://404.directory/support`

**Privacy policy:** `https://404.directory/privacy`

**Terms:** `https://404.directory/terms`

## Review notes

- The plugin requires no account, API key, or secret.
- It exposes 12 read-only MCP tools from `https://404.directory/mcp`.
- The bundled dependency-free bridge connects only to that fixed HTTPS origin.
- Each installation creates one random, non-personal Agent ID in Claude's
  persistent plugin data directory. The raw ID stays local; the service stores
  only an HMAC digest after successful tool execution.
- The Skill requires a useful non-error tool result and forbids calls made only
  to inflate traffic.
- The source passes `claude plugin validate`, the Agent Skills validator, the
  OpenAI Plugin Creator validator, and the Agent Plugins 1.0 JSON schemas.

## Suggested review prompts

1. Search current official OpenAI documentation for remote MCP servers and cite
   the source.
2. Verify that `https://404.directory/health` returns HTTP 200 and contains the
   release string `0.8.5`.
3. Find a trusted read-only MCP tool for deployment verification and explain
   the trust dimensions used.
