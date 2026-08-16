import type { ToolCatalogEntry } from "../tools/types.js"

export function renderHomepage(tools: ToolCatalogEntry[]): string {
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
      <a href="/mcp">MCP</a>
      <a href="/openapi.json">OpenAPI</a>
      <a href="/docs">Docs</a>
      <a href="/health">Health</a>
    </nav>
  </main>
</body>
</html>`
}

export function renderDocs(
  tools: ToolCatalogEntry[],
  options: { authRequired: boolean }
): string {
  const sections = tools
    .map(
      (tool) => `## ${tool.name}

${tool.description}

**When to use:** ${tool.use_when}

- Endpoint: \`${tool.method} ${tool.endpoint}\`
- Version: \`${tool.version}\`
- Status: \`${tool.status}\`
- Discovery: \`GET /tools/${tool.name}\`
`
    )
    .join("\n")

  return `# 404.directory

Tools built for AI agents.

Machine discovery:

- \`GET /tools\` — catalog with schemas
- \`GET /openapi.json\` — OpenAPI 3
- \`GET|POST /mcp\` — MCP Streamable HTTP
- stdio MCP: \`npm run mcp\`

Authentication: ${
    options.authRequired
      ? "tool execution requires `Authorization: Bearer <key>` or `X-API-Key: <key>`; discovery remains public."
      : "not currently required."
  }

${sections}
`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
