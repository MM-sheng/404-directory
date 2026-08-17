<!-- mcp-name: io.github.MM-sheng/404-directory -->

# 404.directory

Tools built for AI agents.

404.directory is a public, read-only MCP server that helps agents understand ordinary webpages and independently verify web deployments. It requires no account or API key.

- MCP endpoint: `https://404.directory/mcp`
- Tool catalog: https://404.directory/tools
- MCP metadata: https://404.directory/mcp-info
- Static MCP server card: https://404.directory/.well-known/mcp/server-card.json
- OpenAPI: https://404.directory/openapi.json
- Agent navigation: https://404.directory/llms.txt
- Health: https://404.directory/health

## Tools

| Tool | Use it when |
| --- | --- |
| `verify_web` | A deployment, URL, HTTPS, redirect, status-code, or expected-text claim needs independent evidence. |
| `understand_webpage` | An agent needs a structured model of a public human-facing page: entities, state, forms, actions, evidence, and confidence. |

Both tools are read-only and idempotent. They only access caller-selected public HTTP(S) URLs and do not log in, click, submit forms, order, pay, or mutate remote state.

## Connect

### Codex CLI

```bash
codex mcp add 404-directory --url https://404.directory/mcp
```

### Claude Code

```bash
claude mcp add --transport http --scope user 404-directory https://404.directory/mcp
```

### VS Code / GitHub Copilot

Add this to your user MCP configuration or `.vscode/mcp.json`:

```json
{
  "servers": {
    "404-directory": {
      "type": "http",
      "url": "https://404.directory/mcp"
    }
  }
}
```

### Cursor

Add this to `~/.cursor/mcp.json` or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "404-directory": {
      "url": "https://404.directory/mcp"
    }
  }
}
```

### ChatGPT developer mode

Create a custom MCP connection and enter `https://404.directory/mcp`. Public-directory publication is separate from direct developer-mode connections.

### Any MCP client

Use Streamable HTTP with:

```text
https://404.directory/mcp
```

No headers or credentials are required.

## Prompts that should select a tool

```text
Another agent says my deployment is finished. Verify that
https://example.com returns 200 over HTTPS and contains build-20260817.
```

Expected selection: `verify_web`

```text
Understand this public signup page. Tell me its entities, current state,
forms, and actions without submitting anything: https://example.com
```

Expected selection: `understand_webpage`

## Direct REST use

MCP is the preferred Agent interface. REST is also available:

```bash
curl -sS https://404.directory/verify/web \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","expected_status":200,"expected_text":"Example Domain"}'
```

```bash
curl -sS https://404.directory/understand \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com"}'
```

## Discovery and trust

- Official MCP Registry: [`io.github.MM-sheng/404-directory`](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.MM-sheng%2F404-directory/versions/latest)
- Production HTTPS endpoint; no local process or package installation required
- Structured schemas, evidence-linked results, explicit tool annotations, and Agent-readable errors
- Public and free during the current stage, with fair-use rate limits
- Private, loopback, link-local, and reserved network targets are rejected

For complete schemas and examples, use:

```text
GET https://404.directory/tools/verify_web
GET https://404.directory/tools/understand_webpage
```

## Status and support

- Documentation: https://404.directory/docs
- Privacy: https://404.directory/privacy
- Terms: https://404.directory/terms
- Security reports: see [SECURITY.md](SECURITY.md)
