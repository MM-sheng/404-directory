import { randomUUID } from "node:crypto"
import type {
  ActivationFunnelSummary,
  AgentUsageSummary,
  VerifiedAgentEvidenceSummary,
  RiskEvaluationSummary,
  PredictionMarketEvaluationSummary,
} from "../domain/store.js"
import type { ReliabilitySummary } from "../domain/metrics.js"
import type { ServiceToolEntry } from "../mcp/service-manifest.js"
import { SERVICE_VERSION } from "../version.js"

export function renderHomepage(tools: ServiceToolEntry[]): string {
  const has = (name: string) => tools.some((tool) => tool.name === name)
  const hasPreflight = has("evaluate_prediction_market")
  const firstTool = hasPreflight ? "evaluate_prediction_market" : tools[0]?.name
  const pageTitle = hasPreflight
    ? "404.directory — Risk preflight for AI Agent actions"
    : "404.directory — Tools for AI Agents"
  const introduction = hasPreflight
    ? "Preflight Polymarket settlement wording, timing, liquidity, eligibility, and execution mode without predicting or trading. Registered tool preflight remains available."
    : "Use the enabled service tools listed below. Unavailable catalog or gateway capabilities are not advertised as callable."
  const toolLines = tools
    .map(
      (tool) =>
        `  <li><a href="${escapeHtml(tool.href)}"><code>${escapeHtml(tool.name)}</code></a> — ${escapeHtml(tool.title ?? tool.name)}</li>`
    )
    .join("\n")

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(introduction)}" />
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />
  <link rel="canonical" href="https://404.directory/" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(introduction)}" />
  <meta property="og:url" content="https://404.directory/" />
  <meta property="og:image" content="https://404.directory/icon.svg" />
  <meta name="twitter:card" content="summary" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "name": "404.directory",
        "url": "https://404.directory/",
        "description": ${JSON.stringify(introduction)}
      },
      {
        "@type": "SoftwareApplication",
        "name": "404.directory",
        "applicationCategory": "DeveloperApplication",
        "operatingSystem": "Any",
        "softwareVersion": "${SERVICE_VERSION}",
        "dateModified": "2026-08-26",
        "url": "https://404.directory/",
        "downloadUrl": "https://404.directory/connect",
        "codeRepository": "https://github.com/MM-sheng/404-directory",
        "license": "https://opensource.org/license/mit",
        "description": ${JSON.stringify(introduction)},
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What can an AI Agent do with 404.directory?",
            "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(introduction)} }
          },
          {
            "@type": "Question",
            "name": "Does 404.directory require credentials?",
            "acceptedAnswer": { "@type": "Answer", "text": "No account or API key is currently required for the public read-only tools." }
          },
          {
            "@type": "Question",
            "name": "What counts as a real external Agent user?",
            "acceptedAnswer": { "@type": "Answer", "text": "Only a de-duplicated external Agent with a privacy-safe installation identity and at least one successful tool execution counts. Views, installs, probes, initialization, tool listing, and internal tests do not count." }
          }
        ]
      }
    ]
  }
  </script>
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
    .definition {
      margin: 0 0 1.25rem;
      color: var(--fg);
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
    .faq {
      margin: 0 0 2rem;
    }
    .faq h3 {
      margin: 1rem 0 0.25rem;
      font-size: 1rem;
    }
    .faq p {
      margin: 0;
      color: var(--muted);
    }
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
    <p class="tagline">${hasPreflight ? "Risk preflight before an Agent acts." : "Tools for real Agent tasks."}</p>
    <p class="definition">${escapeHtml(introduction)} Public tool access requires no account; outcome reporting requires the one-time receipt token.</p>
    <a class="cta" href="/connect?source=homepage">Connect your Agent →</a>
    <section class="skill-install">
      <h2>Install as an Agent Skill</h2>
      <p>Works with Codex, Claude Code, Cursor, Cline, and other Agent Skills clients.</p>
      <pre><code>npx skills add MM-sheng/404-directory --skill use-404-directory -g -y</code></pre>
    </section>
    <section class="first-call">
      <h2>Enter the decision path</h2>
      ${firstTool ? `<a href="/tools/${escapeHtml(firstTool)}"><code>${escapeHtml(firstTool)}</code></a>` : "No service tools are enabled."}
      <p>${hasPreflight ? "Submit one exact Polymarket market, intended Yes/No action, approximate notional, execution mode, and caller-observed eligibility. 404.directory never places the order." : "Follow the tool metadata link for supported inputs and available invocation routes."}</p>
      ${hasPreflight ? '<div class="providers"><span>allow</span><span>review</span><span>block</span><span>receipt</span></div>' : ""}
    </section>
    ${has("search_official_docs") ? '<p class="definition">Use <a href="/tools/search_official_docs"><code>search_official_docs</code></a> for first-party documentation, subject to current curated-source availability. This gateway capability is MCP-only.</p>' : ""}
    <h2>Available 404 service tools</h2>
    <p>These names are callable through MCP. Each metadata link lists its input contract and any available REST equivalent. ${has("search_tools") ? '<a href="/v1/tools/search">Ecosystem records</a> describe registered targets, including first-party and third-party tools; listing one does not authorize or enable its execution.' : "The ecosystem catalog is not enabled in this instance."}</p>
    <ul>
${toolLines}
    </ul>
    <section class="faq">
      <h2>Questions Agents and operators ask</h2>
      <h3>What can an AI Agent do with 404.directory?</h3>
      <p>${escapeHtml(introduction)}</p>
      <h3>Does it require credentials?</h3>
      <p>No account or API key is currently required. Risk evaluation does not execute the target; outcome reporting writes only bounded enums through a one-time token.</p>
      <h3>What counts as a real external Agent user?</h3>
      <p>Only a de-duplicated Agent installation with separate independent-operator evidence and at least one successful external tool execution. Views, installs, copied IDs, probes, initialization, tool listing, anonymous calls, failures, and internal tests do not count.</p>
    </section>
    <nav>
      <a href="/connect?source=homepage-nav">Connect</a>
      <a href="/tools">Tools</a>
      <a href="/v1/metrics/verified-agents">Verified Agent usage</a>
      <a href="/v1/metrics/reliability">Reliability</a>
      <a href="/metrics">Dashboard</a>
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

export function renderDocs(tools: ServiceToolEntry[]): string {
  const sections = tools
    .map((tool) => {
      const rest = tool.invocation.rest
      return [
        "## " + tool.name,
        "",
        tool.description,
        "",
        "- Metadata: `GET " + tool.href + "`",
        "- MCP: `POST /mcp` → `tools/call`, name: `" + tool.name + "`",
        "- Input schema: `input_schema` in the metadata is the MCP argument contract.",
        rest
          ? "- REST: `" +
            rest.method +
            " " +
            rest.path +
            "` — " +
            rest.input_mapping
          : "- REST: not available. Use MCP; no standalone HTTP invocation endpoint exists.",
        "- Safety annotations: `" +
          JSON.stringify(tool.annotations ?? {}) +
          "`",
        "",
      ].join("\n")
    })
    .join("\n")

  return `# 404.directory

Tools built for AI agents.

## Two distinct directories

- \`GET /tools\` lists enabled, callable **404 service tools** — the same names as MCP \`tools/list\`.
- \`GET /v1/tools/search\` lists **registered ecosystem targets**, including first-party and third-party tools, not additional MCP tool names.
- \`GET /v1/capabilities\` lists ecosystem capability labels, not the 404 service inventory.
- Discovery never grants execution permission. Remote execution remains subject to curation, lifecycle, ownership, authentication and gateway policy.
- Some service tools are MCP-only. Follow \`invocation.mcp\` or the explicitly listed \`invocation.rest\`; do not guess an HTTP path.
- MCP and REST parameter encoding can differ. REST request contracts are documented in \`/openapi.json\`.

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

## Become eligible as a real external Agent

Add a stable, random, non-personal identifier to every MCP request. 404.directory
stores only an irreversible HMAC digest; prompts, arguments, results, raw Agent
IDs, and raw IP addresses are not stored in product analytics.

- Header: \`X-404-Agent-ID: agent:<your-stable-random-id>\`
- Optional attribution: \`X-404-Source: <source>\`
- Verified public progress: \`GET /v1/metrics/verified-agents\`
- Unverified installation diagnostics: \`GET /v1/metrics/agents\`
- Activation diagnostics: \`GET /v1/metrics/activation\`
- Tool/provider reliability: \`GET /v1/metrics/reliability?days=30\`
- Risk preflight funnel: \`GET /v1/metrics/risk-evaluations\`
- Human setup: \`GET /connect\`
- Agent-readable setup: \`GET /connect.md\`

Do not install the hosted endpoint with a bare URL if you want the Agent to
retain a privacy-safe identity. Use the generated configuration instead:

- Human installation: \`GET /connect\`
- Agent-readable installation: \`GET /connect.md\`

${sections}
`
}

export function renderPrivacy(): string {
  return `# Privacy policy

Effective: 2026-08-17

404.directory provides contextual risk preflight for prediction-market actions and registered third-party tools, plus public web inspection and verification.

- Submitted URLs and optional expected text are used only to perform the requested tool call.
- The service does not require an account and does not use submitted data for advertising.
- The application does not intentionally persist tool inputs or results in a database. A risk preflight stores only the registered target snapshot, policy version, enumerated action, data-sensitivity class, execution mode, enumerated permissions, decision, evidence summaries, timestamps, and optional privacy-safe Agent attribution. It returns a one-time outcome token but stores only the token hash. A later outcome contains only bounded action/result enums and is labeled self-reported; it does not directly increase Trust.
- Prediction-market preflight stores only public market/rule/order-book fields, their snapshot hash, a bounded intended-action/notional/eligibility context, the decision and evidence summaries, timestamps, optional privacy-safe Agent attribution, and an optional bounded behavior outcome. It never stores wallet keys, order payloads, prompts, personal data, or free-form trading rationale.
- For Agent usage measurement the application may store activation stage, tool/provider name and version, success, finite error category, latency, result count, timestamps, safe client label, attribution source, external/internal classification, request ID, and irreversible HMAC digests of optional Agent and MCP session identifiers. Connect views and installer clicks are diagnostic only and do not count as Agent users. Raw Agent IDs, raw MCP session IDs, prompts, arguments, results, and raw IP addresses are not stored in product analytics. Infrastructure logs may retain request metadata such as timestamp, route, status, duration, request ID, and client IP for security and reliability; request bodies are not logged by the application.
- Fetching a submitted URL sends a request from 404.directory infrastructure to that public destination. The destination may process that request under its own policy.
- Do not submit private, internal, authenticated, personal, or sensitive URLs or content.

Security and privacy questions: use the project support channel associated with 404.directory.
`
}

export function campaignSource(value?: string): string | undefined {
  if (!value) return undefined
  const normalized = value.toLowerCase().trim()
  return /^[a-z0-9][a-z0-9._-]{0,47}$/.test(normalized) ? normalized : undefined
}

export function createDirectClientInstallUrl(
  baseUrl: string,
  client: "cursor" | "vscode",
  campaign?: string
): string {
  const generatedAgentId = `agent:${randomUUID()}`
  const source = campaignSource(campaign)
  const attributionSource = source ? `${source}.${client}` : client
  const endpoint = `${baseUrl}/mcp`
  if (client === "cursor") {
    const config = Buffer.from(
      JSON.stringify({
        url: endpoint,
        headers: {
          "X-404-Agent-ID": generatedAgentId,
          "X-404-Source": attributionSource,
        },
      })
    ).toString("base64")
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=404.directory&config=${encodeURIComponent(config)}`
  }
  return `vscode:mcp/install?${encodeURIComponent(
    JSON.stringify({
      name: "404-directory",
      type: "http",
      url: endpoint,
      headers: {
        "X-404-Agent-ID": generatedAgentId,
        "X-404-Source": attributionSource,
      },
    })
  )}`
}

type ConnectionArtifacts = {
  generatedAgentId: string
  endpoint: string
  cursorInstallUrl: string
  vscodeInstallUrl: string
  codexToml: string
  claudeCommand: string
  openAiResponsesPayload: string
  universalConfig: string
  sourceFor: (client: string) => string
}

function createConnectionArtifacts(
  baseUrl: string,
  campaign?: string
): ConnectionArtifacts {
  const generatedAgentId = `agent:${randomUUID()}`
  const source = campaignSource(campaign)
  const sourceFor = (client: string) =>
    source ? `${source.slice(0, 63 - client.length)}.${client}` : client
  const endpoint = `${baseUrl}/mcp`
  const trackingQuery = source ? `?source=${encodeURIComponent(source)}` : ""
  const cursorInstallUrl = `${baseUrl}/connect/install/cursor${trackingQuery}`
  const vscodeInstallUrl = `${baseUrl}/connect/install/vscode${trackingQuery}`
  const codexToml = `[mcp_servers.404_directory]
url = "${endpoint}"
http_headers = { "X-404-Agent-ID" = "${generatedAgentId}", "X-404-Source" = "${sourceFor("codex")}" }`
  const claudeCommand = `claude mcp add --transport http --scope user 404-directory ${endpoint} \\
  --header "X-404-Agent-ID: ${generatedAgentId}" \\
  --header "X-404-Source: ${sourceFor("claude-code")}"`
  const openAiAgentToken = `${generatedAgentId}@${sourceFor("openai-responses")}`
  const openAiResponsesPayload = JSON.stringify(
    {
      model: "gpt-5.6",
      input:
        "Before I act, preflight this real Polymarket market. Market: REPLACE_WITH_EXACT_POLYMARKET_URL. Intended action: observe. Execution mode: supervised. Geographic eligibility: unknown. Return Decision, Reasons, Evidence, Unknowns, and Next action. Do not predict the winner or trade.",
      tools: [
        {
          type: "mcp",
          server_label: "directory_404",
          server_description:
            "Preflight Polymarket and third-party Agent actions with evidence-backed allow, review, or block decisions.",
          server_url: endpoint,
          authorization: openAiAgentToken,
          allowed_tools: ["evaluate_prediction_market"],
          require_approval: "never",
        },
      ],
      tool_choice: {
        type: "mcp",
        server_label: "directory_404",
        name: "evaluate_prediction_market",
      },
    },
    null,
    2
  )
  const universalConfig = JSON.stringify(
    {
      mcpServers: {
        "404-directory": {
          command: "npx",
          args: [
            "-y",
            "@mmvv1638/404-directory-mcp",
            "--source",
            sourceFor("npx"),
          ],
        },
      },
    },
    null,
    2
  )

  return {
    generatedAgentId,
    endpoint,
    cursorInstallUrl,
    vscodeInstallUrl,
    codexToml,
    claudeCommand,
    openAiResponsesPayload,
    universalConfig,
    sourceFor,
  }
}

export function renderConnectHtml(
  baseUrl: string,
  campaign: string | undefined,
  tools: ServiceToolEntry[]
): string {
  const connection = createConnectionArtifacts(baseUrl, campaign)
  const source = campaignSource(campaign)
  const hasPreflight = tools.some(
    (tool) => tool.name === "evaluate_prediction_market"
  )
  const toolLinks = tools
    .map(
      (tool) =>
        `<a href="${escapeHtml(tool.href)}"><code>${escapeHtml(tool.name)}</code></a>`
    )
    .join(", ")

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connect an Agent — 404.directory</title>
  <meta name="description" content="Connect Cursor, GitHub Copilot, Claude Code, or Codex to 404.directory and complete one useful MCP call." />
  <style>
    :root {
      --bg: #0b0c0f;
      --panel: #11151b;
      --fg: #edf0f2;
      --muted: #9da5ae;
      --line: #2c333d;
      --accent: #c8f542;
      --mono: "IBM Plex Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace;
      --sans: "IBM Plex Sans", "Segoe UI", Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--fg);
      background: radial-gradient(900px 500px at 15% -10%, #1c2838 0%, transparent 58%), var(--bg);
      font-family: var(--sans);
      line-height: 1.55;
    }
    main { max-width: 58rem; margin: 0 auto; padding: 3.5rem 1.25rem 4rem; }
    a { color: inherit; }
    .back { color: var(--muted); text-decoration: none; font-family: var(--mono); font-size: 0.9rem; }
    h1 { margin: 1.2rem 0 0.55rem; font-size: clamp(2.15rem, 6vw, 3.5rem); letter-spacing: -0.045em; }
    .lead { max-width: 46rem; margin: 0; color: var(--muted); font-size: 1.12rem; }
    .badges { display: flex; flex-wrap: wrap; gap: 0.45rem; margin: 1.1rem 0 2rem; }
    .badge { border: 1px solid var(--line); border-radius: 999px; padding: 0.25rem 0.55rem; font-family: var(--mono); font-size: 0.78rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 1rem; }
    .card { padding: 1.15rem; border: 1px solid var(--line); border-radius: 0.7rem; background: var(--panel); }
    .card h2 { margin: 0 0 0.4rem; font-size: 1.05rem; }
    .card p { margin: 0 0 1rem; color: var(--muted); font-size: 0.93rem; }
    .button { display: inline-block; width: 100%; padding: 0.75rem 0.9rem; border: 1px solid var(--accent); border-radius: 0.42rem; background: var(--accent); color: #0b0c0f; text-align: center; text-decoration: none; font-family: var(--mono); font-weight: 750; }
    section { margin-top: 1.2rem; padding: 1.15rem; border: 1px solid var(--line); border-radius: 0.7rem; background: var(--panel); }
    section h2 { margin: 0 0 0.7rem; font-size: 1.05rem; }
    pre { margin: 0; padding: 0.85rem; overflow-x: auto; border-radius: 0.45rem; background: #080a0d; color: #fff; font-family: var(--mono); font-size: 0.82rem; white-space: pre-wrap; word-break: break-word; }
    .first-call { border-color: #5f7425; }
    .first-call strong { color: var(--accent); }
    .first-call p { margin: 0.55rem 0 0; color: var(--muted); }
    .privacy { margin: 1.2rem 0 0; color: var(--muted); font-size: 0.88rem; }
    .links { display: flex; flex-wrap: wrap; gap: 0.7rem 1rem; margin-top: 1.5rem; font-family: var(--mono); font-size: 0.86rem; }
    .links a { color: var(--muted); }
  </style>
</head>
<body>
  <main>
    <a class="back" href="/">← 404.directory</a>
    <h1>Connect an Agent</h1>
    <p class="lead">One MCP connection for the enabled 404 service tools. No account or API key.</p>
    <p>Enabled on this instance: ${toolLinks || "No tools enabled."} Follow each metadata link for its input contract and invocation routes.</p>
    <div class="badges"><span class="badge">focused toolset</span>${hasPreflight ? '<span class="badge">allow / review / block</span>' : ""}<span class="badge">privacy-safe identity</span></div>
    <div class="grid">
      <article class="card">
        <h2>Cursor</h2>
        <p>Open Cursor's MCP installer with a unique non-personal Agent ID already configured.</p>
        <a class="button" href="${escapeHtml(connection.cursorInstallUrl)}">Add to Cursor →</a>
      </article>
      <article class="card">
        <h2>VS Code / Copilot</h2>
        <p>Open VS Code's MCP installer with the same privacy-safe attribution setup.</p>
        <a class="button" href="${escapeHtml(connection.vscodeInstallUrl)}">Install in VS Code →</a>
      </article>
    </div>
    <section>
      <h2>Any stdio MCP client</h2>
      <p class="privacy">Use the dependency-free npm bridge when a client or directory accepts only a command. It creates and preserves one privacy-safe Agent ID automatically.</p>
      <pre><code>${escapeHtml(connection.universalConfig)}</code></pre>
    </section>
    <section>
      <h2>Claude Code plugin</h2>
      <pre><code>/plugin marketplace add MM-sheng/404-directory
/plugin install 404-directory@404-directory</code></pre>
    </section>
    <section>
      <h2>Claude Code direct MCP</h2>
      <pre><code>${escapeHtml(connection.claudeCommand)}</code></pre>
    </section>
    <section>
      <h2>Codex</h2>
      <p class="privacy">Add this configuration to <code>~/.codex/config.toml</code>.</p>
      <pre><code>${escapeHtml(connection.codexToml)}</code></pre>
    </section>
    ${
      hasPreflight
        ? `<section>
      <h2>OpenAI Responses API</h2>
      <p class="privacy">Use this request body with your normal OpenAI API authentication and replace the Polymarket URL before sending. The MCP <code>authorization</code> value is a random, non-personal installation token used only for privacy-safe attribution; it does not grant access. The request limits the MCP surface and forces one real <code>evaluate_prediction_market</code> call. OpenAI model usage may incur charges, while 404.directory itself currently requires no account or API key.</p>
      <pre><code>${escapeHtml(connection.openAiResponsesPayload)}</code></pre>
    </section>`
        : ""
    }
    <section class="first-call">
      <h2>Make the first call useful</h2>
      ${
        hasPreflight
          ? `<p>Paste an exact market you already care about. Do not use <code>tools/list</code>, a health check, or this homepage as the demo task. If your client exposes MCP Prompts, open <code>preflight-prediction-market</code>.</p>
      <strong>Copy, replace the URL, and run:</strong>
      <pre><code>Before I act, use evaluate_prediction_market on REPLACE_WITH_EXACT_POLYMARKET_URL. Set intended_action=observe, execution_mode=supervised, and geographic_eligibility=unknown. Return Decision → Reasons → Evidence → Unknowns → Next action. Do not predict or trade.</code></pre>
      <strong>Add this Agent policy:</strong>
      <pre><code>Before a Polymarket observation or contemplated Yes/No action, call evaluate_prediction_market with the exact market, action, approximate notional, execution mode, and the geoblock result from the execution environment. Never treat allow as a prediction. Obey block and pause on review. Report the bounded behavior result with report_prediction_market_outcome.</code></pre>`
          : "<p>Choose an enabled tool above only when it fits a real user task. Read its inputs and safety annotations before calling. Do not use connection checks or invented tasks as an activation demo.</p>"
      }
      <p>Activation requires a successful business result, not just a non-error protocol response. Empty searches and connection checks do not activate an Agent; later calls do not create additional unique Agents.</p>
    </section>
    <p class="privacy">For the direct configurations above, this page generated <code>${escapeHtml(connection.generatedAgentId)}</code> randomly; keep it stable for that installation. The npm bridge and Claude marketplace plugin create and preserve their own local random IDs. 404.directory stores only an HMAC digest after a successful tool call—never the raw ID, prompt, arguments, or result.</p>
    <nav class="links"><a href="/connect.md${source ? `?source=${escapeHtml(source)}` : ""}">Agent-readable setup</a><a href="https://github.com/MM-sheng/404-directory/issues/1">External Agent pilot</a><a href="/v1/metrics/verified-agents">Verified adoption metric</a><a href="/v1/metrics/prediction-market-evaluations">Prediction preflight evidence</a><a href="/v1/metrics/risk-evaluations">Tool preflight evidence</a><a href="/v1/metrics/reliability">Reliability evidence</a><a href="/privacy">Privacy</a><a href="https://github.com/MM-sheng/404-directory">Source</a></nav>
  </main>
</body>
</html>`
}

export function renderConnect(
  baseUrl: string,
  campaign: string | undefined,
  tools: ServiceToolEntry[]
): string {
  const connection = createConnectionArtifacts(baseUrl, campaign)
  const has = (name: string) => tools.some((tool) => tool.name === name)
  return [
    "# Connect an Agent to 404.directory",
    "",
    "404.directory is a public Streamable HTTP MCP server. Authentication is not",
    "required. To become eligible for verified counting, generate one stable random ID",
    "for that Agent installation and send it as `X-404-Agent-ID`. Do not use an",
    "email address, user name, device name, or other personal value. The examples",
    "below already contain a newly generated ID; keep it stable after installing.",
    "A successful call is necessary but does not count by itself: the external pilot",
    "must also establish independent-operator evidence through 404.directory.",
    "",
    `MCP endpoint: \`${connection.endpoint}\``,
    "",
    "## Enabled service tools",
    "",
    ...tools.map(
      (tool) =>
        `- [\`${tool.name}\`](${baseUrl}${tool.href}) — inputs and invocation routes.`
    ),
    ...(tools.length ? [] : ["No tools are enabled on this instance."]),
    "",
    "## Any stdio MCP client",
    "",
    "Use this when a client or Agent directory accepts a command-based MCP server.",
    "The dependency-free bridge creates and preserves one privacy-safe Agent ID",
    "for the installation automatically.",
    "",
    "```json",
    connection.universalConfig,
    "```",
    "",
    "## Codex",
    "",
    "Add this to `~/.codex/config.toml`:",
    "",
    "```toml",
    "[mcp_servers.404_directory]",
    `url = "${connection.endpoint}"`,
    `http_headers = { "X-404-Agent-ID" = "${connection.generatedAgentId}", "X-404-Source" = "${connection.sourceFor("codex")}" }`,
    "```",
    "",
    "## VS Code / GitHub Copilot",
    "",
    `[Install in VS Code](${connection.vscodeInstallUrl})`,
    "",
    "## Cursor",
    "",
    `[Add 404.directory to Cursor](${connection.cursorInstallUrl})`,
    "",
    "## Claude Code",
    "",
    "```bash",
    connection.claudeCommand,
    "```",
    "",
    "## JavaScript MCP SDK",
    "",
    "```ts",
    "const transport = new StreamableHTTPClientTransport(",
    `  new URL("${connection.endpoint}"),`,
    "  {",
    "    requestInit: {",
    "      headers: {",
    `        "X-404-Agent-ID": "${connection.generatedAgentId}",`,
    `        "X-404-Source": "${connection.sourceFor("sdk")}",`,
    "      },",
    "    },",
    "  }",
    ")",
    "```",
    "",
    ...(has("evaluate_prediction_market")
      ? [
          "## OpenAI Responses API",
          "",
          "Use this JSON as the request body for `POST https://api.openai.com/v1/responses`",
          "with your normal OpenAI API authentication. Replace the question before",
          "sending. The MCP `authorization` value is a random, non-personal",
          "installation token used only for privacy-safe attribution; it does not",
          "grant access. The request limits the MCP surface and forces one real",
          "`evaluate_prediction_market` call. OpenAI model usage may incur charges;",
          "404.directory itself currently requires no account or API key.",
          "",
          "```json",
          connection.openAiResponsesPayload,
          "```",
          "",
        ]
      : []),
    "## Verify the connection",
    "",
    "If the client exposes MCP Prompts, choose a currently enabled prompt from",
    "`prompts/list`. Opening a prompt is diagnostic only; it must lead to a",
    "successful tool call that answers the user's real task.",
    "",
    "Complete one task the user already needs; never call a tool only to create",
    "traffic. Choose the smallest relevant first call:",
    "",
    ...(has("evaluate_prediction_market")
      ? [
          "- Polymarket observation or contemplated Yes/No action: call",
          "  `evaluate_prediction_market` with the exact market, action, approximate",
          "  notional, execution mode, and the geoblock result from the actual",
          "  execution environment. Never treat allow as a forecast or instruction",
          "  to trade; report bounded behavior with `report_prediction_market_outcome`.",
        ]
      : []),
    ...(has("search_official_docs")
      ? [
          "- Current AI/cloud documentation: call `search_official_docs` with the",
          "  user's actual technical question and cite the returned first-party URLs.",
        ]
      : []),
    ...(has("verify_web")
      ? [
          "- A deployment claim: call `verify_web` with the public URL plus an expected",
          "  status or release-specific text.",
        ]
      : []),
    ...(has("evaluate_tool_risk")
      ? [
          "- Third-party tool installation or first use: call `search_tools` if the",
          "  exact slug is unknown, then call `evaluate_tool_risk` with the intended",
          "  action, data sensitivity, execution mode, and every permission. Obey",
          "  block; pause for human review on review; report the later bounded outcome.",
        ]
      : []),
    "",
    "Activation requires a successful business result, not just a non-error",
    "protocol response. Empty searches and connection checks do not activate an",
    "Agent. After independent verification, one Agent installation counts once",
    "toward the public target regardless of later calls.",
    "",
    `Verified progress: ${baseUrl}/v1/metrics/verified-agents`,
    `Unverified installation diagnostics: ${baseUrl}/v1/metrics/agents`,
    `Prediction-market preflight: ${baseUrl}/v1/metrics/prediction-market-evaluations`,
    `Risk preflight: ${baseUrl}/v1/metrics/risk-evaluations`,
    `Reliability: ${baseUrl}/v1/metrics/reliability?days=30`,
    "External Agent pilot: https://github.com/MM-sheng/404-directory/issues/1",
    `Privacy: ${baseUrl}/privacy`,
    "",
  ].join("\n")
}

export function renderTerms(): string {
  return `# Terms of service

Effective: 2026-08-17

404.directory is a public Agent action risk-preflight, discovery, web inspection, and verification service provided as-is.

- Use it only for public HTTP(S) resources you are authorized to inspect.
- Do not use it to target private networks, bypass access controls, overload services, or violate applicable law or third-party rights.
- Results are evidence for agent decisions, not a guarantee of correctness, availability, security, or fitness for a particular purpose.
- Prediction-market results are not a forecast, instruction to trade, or legal, financial, or investment advice. 404.directory does not place orders, access wallets, or custody funds.
- A preflight may store bounded decision context and accept one token-bound, self-reported outcome as described in the privacy policy. It does not independently prove the outcome.
- Access may be rate-limited, changed, or suspended to protect service stability and safety.
- Current tools are free and require no authentication. Material pricing or access changes will be disclosed before they apply.
`
}

function percent(value: number | null): string {
  return value === null ? "not enough data" : `${(value * 100).toFixed(1)}%`
}

export function renderMetricsDashboard(
  verifiedAgents: VerifiedAgentEvidenceSummary,
  agents: AgentUsageSummary,
  activation: ActivationFunnelSummary,
  reliability: ReliabilitySummary,
  risk: RiskEvaluationSummary,
  prediction: PredictionMarketEvaluationSummary
): string {
  const preflightSection = (
    title: string,
    summary: RiskEvaluationSummary | PredictionMarketEvaluationSummary
  ) => {
    const rows = [
      ["identified_external", "Identified external installations"],
      ["anonymous_external", "Anonymous external"],
      ["internal", "Internal / non-external"],
      ["unattributed", "Unattributed"],
      ["total", "All traffic (not adoption)"],
    ] as const
    return `<section><h2>${escapeHtml(title)}</h2><table><thead><tr><th>Scope</th><th>Evaluations</th><th>Identified installations</th><th>Allow</th><th>Review</th><th>Block</th><th>Outcome reports</th><th>Reported behavior changes</th></tr></thead><tbody>${rows
      .map(([scope, label]) => {
        const row = summary.scopes[scope]
        return `<tr data-scope="${scope}"><td>${label}</td><td>${row.evaluations}</td><td>${row.identified_external_agents}</td><td>${row.decisions.allow}</td><td>${row.decisions.review}</td><td>${row.decisions.block}</td><td>${row.reported_outcomes} (${percent(row.outcome_report_rate)})</td><td>${row.behavior_changes} (${percent(row.behavior_change_rate)})</td></tr>`
      })
      .join(
        ""
      )}</tbody></table><p class="muted">${escapeHtml(summary.evidence_notice)}</p><p class="muted">This attribution table is diagnostic. The verified adoption cards above require separate independent-operator evidence plus successful execution.</p></section>`
  }
  const sourceRows = activation.sources
    .slice(0, 12)
    .map(
      (source) => `<tr>
        <td><code>${escapeHtml(source.source)}</code></td>
        <td>${source.connect_views}</td><td>${source.install_clicks}</td>
        <td>${source.initialized_agents}</td><td>${source.prompt_get_agents}</td><td>${source.tool_call_agents}</td>
        <td>${source.successful_agents}</td><td>${source.failed_agents}</td>
        <td>${percent(source.tool_call_rate)}</td>
        <td>${percent(source.tool_success_rate)}</td>
        <td>${percent(source.prompt_activation_rate)}</td>
        <td>${percent(source.activation_rate)}</td>
      </tr>`
    )
    .join("\n")
  const toolRows = reliability.tools
    .slice(0, 12)
    .map(
      (tool) => `<tr>
        <td><code>${escapeHtml(tool.tool_name)}</code></td>
        <td>${tool.invocations}</td><td>${tool.identified_agents}</td>
        <td>${percent(tool.success_rate)}</td><td>${tool.p95_latency_ms ?? "—"}</td>
        <td>${escapeHtml(tool.last_observed_at)}</td>
      </tr>`
    )
    .join("\n")
  const errorRows = reliability.errors
    .slice(0, 10)
    .map(
      (error) =>
        `<tr><td><code>${escapeHtml(error.error_type)}</code></td><td>${error.events}</td></tr>`
    )
    .join("\n")
  const progress = Math.min(100, verifiedAgents.progress_ratio * 100)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent evidence — 404.directory</title>
  <style>
    :root { --bg:#0b0c0f; --panel:#11151b; --fg:#edf0f2; --muted:#9da5ae; --line:#2c333d; --accent:#c8f542; --mono:"IBM Plex Mono","SF Mono",monospace; }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--fg); background:var(--bg); font-family:system-ui,sans-serif; line-height:1.5; }
    main { max-width:78rem; margin:0 auto; padding:2rem 1rem 4rem; }
    a { color:var(--accent); } h1 { margin:.6rem 0 .2rem; } h2 { margin:0 0 .8rem; font-size:1rem; }
    .muted { color:var(--muted); } .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(13rem,1fr)); gap:.8rem; margin:1.4rem 0; }
    .card, section { border:1px solid var(--line); border-radius:.65rem; background:var(--panel); padding:1rem; }
    .value { font:700 1.55rem var(--mono); } .progress { height:.65rem; border-radius:1rem; background:#262c34; overflow:hidden; margin-top:.7rem; }
    .progress span { display:block; height:100%; background:var(--accent); width:${progress}%; }
    section { margin-top:1rem; overflow-x:auto; } table { width:100%; border-collapse:collapse; font-size:.86rem; }
    th,td { padding:.55rem; border-bottom:1px solid var(--line); text-align:left; white-space:nowrap; }
    th { color:var(--muted); font-weight:600; } code { font-family:var(--mono); }
  </style>
</head>
<body><main>
  <a href="/">← 404.directory</a>
  <h1>Agent usage evidence</h1>
  <p class="muted">Verified adoption requires a manually admitted independent operator and a matching successful external Agent execution. Admissions alone, copied IDs, failures, anonymous calls, probes, crawlers, and internal tests do not count.</p>
  <div class="grid">
    <article class="card"><div class="muted">Verified external Agents</div><div class="value">${verifiedAgents.verified_external_agents} / ${verifiedAgents.target_external_agents}</div><div class="progress"><span></span></div></article>
    <article class="card"><div class="muted">Verified independent operators</div><div class="value">${verifiedAgents.verified_operators}</div></article>
    <article class="card"><div class="muted">Verified successful executions</div><div class="value">${verifiedAgents.successful_external_invocations}</div></article>
    <article class="card"><div class="muted">Active evidence admissions</div><div class="value">${verifiedAgents.active_admissions}</div><div class="muted">Admissions without successful execution do not count</div></article>
    <article class="card"><div class="muted">Unverified installation IDs</div><div class="value">${agents.identified_external_agents}</div><div class="muted">Diagnostic only · ${agents.anonymous_successful_invocations} anonymous successes</div></article>
    <article class="card"><div class="muted">7-day verified retention</div><div class="value">${percent(verifiedAgents.retention.day_7.retention_rate)}</div><div class="muted">${verifiedAgents.retention.day_7.retained_agents}/${verifiedAgents.retention.day_7.eligible_agents} eligible</div></article>
    <article class="card"><div class="muted">30-day verified retention</div><div class="value">${percent(verifiedAgents.retention.day_30.retention_rate)}</div><div class="muted">${verifiedAgents.retention.day_30.retained_agents}/${verifiedAgents.retention.day_30.eligible_agents} eligible</div></article>
    <article class="card"><div class="muted">30-day external success rate</div><div class="value">${percent(reliability.overall.success_rate)}</div><div class="muted">${reliability.overall.invocations} observations</div></article>
  </div>
  ${preflightSection("Risk preflight — by attribution", risk)}
  ${preflightSection("Prediction-market preflight — by attribution", prediction)}
  <section><h2>Activation by source</h2><table><thead><tr><th>Source</th><th>Views</th><th>Installs</th><th>Initialized Agents</th><th>Prompt-opened Agents</th><th>Calling Agents</th><th>Successful Agents</th><th>Failed Agents</th><th>Call rate</th><th>Call success</th><th>Prompt→success</th><th>Activation</th></tr></thead><tbody>${sourceRows || '<tr><td colspan="12">No evidence yet</td></tr>'}</tbody></table></section>
  <section><h2>Tool reliability — last 30 days</h2><table><thead><tr><th>Tool</th><th>Calls</th><th>Agents</th><th>Success</th><th>P95 ms</th><th>Last observed</th></tr></thead><tbody>${toolRows || '<tr><td colspan="6">No external executions yet</td></tr>'}</tbody></table></section>
  <section><h2>Canonical errors — last 30 days</h2><table><thead><tr><th>Error</th><th>Events</th></tr></thead><tbody>${errorRows || '<tr><td colspan="2">No external failures observed</td></tr>'}</tbody></table></section>
  <p class="muted">Generated ${escapeHtml(verifiedAgents.generated_at)}. Raw Agent IDs, operator IDs, evidence references, session IDs, prompts, arguments and results are never shown.</p>
</main></body></html>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
