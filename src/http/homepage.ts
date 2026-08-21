import { randomUUID } from "node:crypto"
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
      margin: 0 0 1rem;
      color: var(--muted);
      font-size: 1.15rem;
    }
    .cta {
      display: inline-block;
      margin: 0 0 2.25rem;
      padding: 0.75rem 1rem;
      color: #0b0c0f;
      background: var(--accent);
      border: 1px solid var(--accent);
      border-radius: 0.4rem;
      font-family: var(--mono);
      font-weight: 700;
    }
    .cta:hover { color: #0b0c0f; border-bottom-color: var(--accent); }
    .first-call {
      margin: 0 0 2rem;
      padding: 1rem;
      border: 1px solid var(--line);
      border-radius: 0.5rem;
      background: #101318;
    }
    .first-call p { margin: 0.45rem 0 0; color: var(--muted); }
    .skill-install {
      margin: 0 0 2rem;
      padding: 1rem;
      border: 1px solid var(--line);
      border-radius: 0.5rem;
      background: #101318;
    }
    .skill-install p { margin: 0 0 0.65rem; color: var(--muted); }
    pre {
      margin: 0;
      padding: 0.75rem;
      overflow-x: auto;
      border-radius: 0.35rem;
      background: #080a0d;
    }
    .providers {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-top: 0.85rem;
    }
    .providers span {
      padding: 0.2rem 0.45rem;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--fg);
      font-family: var(--mono);
      font-size: 0.78rem;
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
    <p class="tagline">One MCP connection for official docs and trusted read-only Agent tools.</p>
    <a class="cta" href="/connect?source=homepage">Connect your Agent →</a>
    <section class="skill-install">
      <h2>Install as an Agent Skill</h2>
      <p>Works with Codex, Claude Code, Cursor, Cline, and other Agent Skills clients.</p>
      <pre><code>npx skills add MM-sheng/404-directory --skill use-404-directory -g -y</code></pre>
    </section>
    <section class="first-call">
      <h2>Get value on the first call</h2>
      <code>search_official_docs</code>
      <p>Search four first-party developer documentation sources in parallel, with source provenance and graceful partial results.</p>
      <div class="providers">
        <span>OpenAI</span><span>Microsoft Learn</span><span>AWS</span><span>Cloudflare</span>
      </div>
    </section>
    <h2>Built-in web tools</h2>
    <ul>
${toolLines}
    </ul>
    <nav>
      <a href="/connect?source=homepage-nav">Connect</a>
      <a href="/tools">Tools</a>
      <a href="/v1/metrics/agents">Agent usage</a>
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

## Count as a real external Agent

Add a stable, random, non-personal identifier to every MCP request. 404.directory
stores only an irreversible HMAC digest; prompts, arguments, results, raw Agent
IDs, and raw IP addresses are not stored in product analytics.

- Header: \`X-404-Agent-ID: agent:<your-stable-random-id>\`
- Optional attribution: \`X-404-Source: <source>\`
- Public progress: \`GET /v1/metrics/agents\`
- Complete setup: \`GET /connect\`

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
- The application does not intentionally persist tool inputs or results in a database. For Agent usage measurement it may store tool name, success, latency, client label, attribution source, and an irreversible HMAC digest of an optional \`X-404-Agent-ID\`. Raw Agent IDs, prompts, arguments, results, and raw IP addresses are not stored in product analytics. Infrastructure logs may retain request metadata such as timestamp, route, status, duration, request ID, and client IP for security and reliability; request bodies are not logged by the application.
- Fetching a submitted URL sends a request from 404.directory infrastructure to that public destination. The destination may process that request under its own policy.
- Do not submit private, internal, authenticated, personal, or sensitive URLs or content.

Security and privacy questions: use the project support channel associated with 404.directory.
`
}

function campaignSource(value?: string): string | undefined {
  if (!value) return undefined
  const normalized = value.toLowerCase().trim()
  return /^[a-z0-9][a-z0-9._-]{0,47}$/.test(normalized) ? normalized : undefined
}

export function renderConnect(baseUrl: string, campaign?: string): string {
  const generatedAgentId = `agent:${randomUUID()}`
  const source = campaignSource(campaign)
  const attributedSource = (client: string) =>
    source ? `${source}.${client}` : client
  const cursorConfig = Buffer.from(
    JSON.stringify({
      url: `${baseUrl}/mcp`,
      headers: {
        "X-404-Agent-ID": generatedAgentId,
        "X-404-Source": attributedSource("cursor"),
      },
    })
  ).toString("base64")
  const cursorInstallUrl = `cursor://anysphere.cursor-deeplink/mcp/install?name=404.directory&config=${encodeURIComponent(cursorConfig)}`
  const vscodeInstallUrl = `vscode:mcp/install?${encodeURIComponent(
    JSON.stringify({
      name: "404-directory",
      type: "http",
      url: `${baseUrl}/mcp`,
      headers: {
        "X-404-Agent-ID": generatedAgentId,
        "X-404-Source": attributedSource("vscode"),
      },
    })
  )}`
  return [
    "# Connect an Agent to 404.directory",
    "",
    "404.directory is a public Streamable HTTP MCP server. Authentication is not",
    "required. To count as one real external Agent, generate one stable random ID",
    "for that Agent installation and send it as `X-404-Agent-ID`. Do not use an",
    "email address, user name, device name, or other personal value. The examples",
    "below already contain a newly generated ID; keep it stable after installing.",
    "",
    `MCP endpoint: \`${baseUrl}/mcp\``,
    "",
    "## Codex",
    "",
    "Add this to `~/.codex/config.toml`:",
    "",
    "```toml",
    "[mcp_servers.404_directory]",
    `url = "${baseUrl}/mcp"`,
    `http_headers = { "X-404-Agent-ID" = "${generatedAgentId}", "X-404-Source" = "${attributedSource("codex")}" }`,
    "```",
    "",
    "## VS Code / GitHub Copilot",
    "",
    `[Install in VS Code](${vscodeInstallUrl})`,
    "",
    "## Cursor",
    "",
    `[Add 404.directory to Cursor](${cursorInstallUrl})`,
    "",
    "## Claude Code",
    "",
    "```bash",
    `claude mcp add --transport http --scope user 404-directory ${baseUrl}/mcp \\`,
    `  --header "X-404-Agent-ID: ${generatedAgentId}" \\`,
    `  --header "X-404-Source: ${attributedSource("claude-code")}"`,
    "```",
    "",
    "## JavaScript MCP SDK",
    "",
    "```ts",
    "const transport = new StreamableHTTPClientTransport(",
    `  new URL("${baseUrl}/mcp"),`,
    "  {",
    "    requestInit: {",
    "      headers: {",
    `        "X-404-Agent-ID": "${generatedAgentId}",`,
    `        "X-404-Source": "${attributedSource("sdk")}",`,
    "      },",
    "    },",
    "  }",
    ")",
    "```",
    "",
    "## Verify the connection",
    "",
    "Call `search_official_docs` with a technical question for an immediate",
    "multi-provider result. For deeper discovery, call `search_tools`, then",
    "`inspect_tool_server`, then `invoke_registered_tool`. A successful execution counts once toward the",
    "public unique-Agent target, regardless of how many later calls that Agent makes.",
    "",
    `Progress: ${baseUrl}/v1/metrics/agents`,
    `Privacy: ${baseUrl}/privacy`,
    "",
  ].join("\n")
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
