import type { ToolCatalogEntry, ToolDiscoveryEntry } from "../tools/types.js"

export function renderHomepage(tools: ToolDiscoveryEntry[]): string {
  const toolLines = tools
    .map(
      (tool) =>
        `  <li><code>${escapeHtml(tool.name)}</code> — ${escapeHtml(tool.use_when)}</li>`
    )
    .join("\n")

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>404.directory</title>
  <style>
    :root {
      --bg: #0b0c0f;
      --fg: #e8eaed;
      --muted: #9aa0a6;
      --line: #2a2e35;
      --accent: #c8f542;
      --mono: "IBM Plex Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace;
      --sans: "IBM Plex Sans", "Segoe UI", Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--fg);
      background:
        radial-gradient(1200px 600px at 10% -10%, #1a2230 0%, transparent 55%),
        radial-gradient(900px 500px at 100% 0%, #142018 0%, transparent 50%),
        var(--bg);
      font-family: var(--sans);
      line-height: 1.5;
    }
    main {
      max-width: 44rem;
      margin: 0 auto;
      padding: 4.5rem 1.25rem 3rem;
    }
    h1 {
      margin: 0 0 0.4rem;
      font-size: clamp(2.4rem, 6vw, 3.4rem);
      letter-spacing: -0.04em;
      font-weight: 600;
    }
    .tagline {
      margin: 0 0 2rem;
      color: var(--muted);
      font-size: 1.15rem;
    }
    h2 {
      margin: 0 0 0.75rem;
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--accent);
      font-family: var(--mono);
    }
    ul {
      margin: 0 0 2rem;
      padding-left: 1.1rem;
    }
    li { margin: 0.45rem 0; }
    code {
      font-family: var(--mono);
      font-size: 0.92em;
      color: #fff;
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1.1rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--line);
      font-family: var(--mono);
      font-size: 0.92rem;
    }
    a {
      color: var(--fg);
      text-decoration: none;
      border-bottom: 1px solid transparent;
    }
    a:hover { border-bottom-color: var(--accent); color: var(--accent); }
  </style>
</head>
<body>
  <main>
    <h1>404.directory</h1>
    <p class="tagline">Tools built for AI agents.</p>
    <h2>Available tools</h2>
    <ul>
${toolLines}
    </ul>
    <nav>
      <a href="/tools">Tools</a>
      <a href="/mcp-info">MCP</a>
      <a href="/openapi.json">OpenAPI</a>
      <a href="/docs">Docs</a>
      <a href="/health">Health</a>
      <a href="https://github.com/MM-sheng/404-directory">GitHub</a>
    </nav>
  </main>
</body>
</html>`
}

export function renderDocs(tools: ToolCatalogEntry[]): string {
  const sections = tools
    .map(
      (tool) => `## ${tool.name}

${tool.description}

**When to use:** ${tool.use_when}

**Do not use when:** ${tool.do_not_use_when}

- Endpoint: \`${tool.method} ${tool.endpoint}\`
- Version: \`${tool.version}\`
- Status: \`${tool.status}\`
- Read only: \`${tool.read_only}\`
- Side effects: \`${tool.side_effects.length === 0 ? "none" : tool.side_effects.join(", ")}\`
- Authentication: \`${tool.requires_auth ? "required" : "not required"}\`
- Cost: \`${tool.cost}\`
- Typical latency: \`${tool.typical_latency_ms} ms\`
- Discovery: \`GET /tools/${tool.name}\`
`
    )
    .join("\n")

  return `# 404.directory

Tools built for AI agents.

Machine discovery:

- \`GET /tools\` — compact discovery catalog
- \`GET /tools/:name\` — complete metadata and schemas
- \`GET /openapi.json\` — OpenAPI 3
- \`GET /mcp-info\` — MCP discovery metadata
- \`GET /.well-known/mcp/server-card.json\` — static MCP server card for registries
- \`POST /mcp\` — MCP Streamable HTTP protocol endpoint
- Official MCP Registry: \`io.github.MM-sheng/404-directory\`
- Public setup repository: https://github.com/MM-sheng/404-directory

Authentication: not currently required.

Connect from Codex CLI:

\`\`\`bash
codex mcp add 404-directory --url https://404.directory/mcp
\`\`\`

Connect from Claude Code:

\`\`\`bash
claude mcp add --transport http --scope user 404-directory https://404.directory/mcp
\`\`\`

${sections}
`
}

export function renderPrivacy(): string {
  return `# Privacy policy

Effective: 2026-08-17

404.directory provides read-only tools that fetch public HTTP(S) URLs supplied by a caller.

- Submitted URLs and optional expected text are used only to perform the requested tool call.
- The service does not require an account and does not use submitted data for advertising.
- The application does not intentionally persist tool inputs or results in a database. Infrastructure logs may retain request metadata such as timestamp, route, status, duration, request ID, and client IP for security and reliability; request bodies are not logged by the application.
- Fetching a submitted URL sends a request from 404.directory infrastructure to that public destination. The destination may process that request under its own policy.
- Do not submit private, internal, authenticated, personal, or sensitive URLs or content.

Security and privacy questions: use the project support channel associated with 404.directory.
`
}

export function renderTerms(): string {
  return `# Terms of service

Effective: 2026-08-17

404.directory is a public, read-only web inspection and verification service provided as-is.

- Use it only for public HTTP(S) resources you are authorized to inspect.
- Do not use it to target private networks, bypass access controls, overload services, or violate applicable law or third-party rights.
- Results are evidence for agent decisions, not a guarantee of correctness, availability, security, or fitness for a particular purpose.
- Access may be rate-limited, changed, or suspended to protect service stability and safety.
- Current tools are free and require no authentication. Material pricing or access changes will be disclosed before they apply.
`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
