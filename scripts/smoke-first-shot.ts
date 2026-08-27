import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

const baseUrl = (process.env.FIRST_SHOT_BASE_URL ?? "https://404.directory").replace(
  /\/$/,
  ""
)
const webpageUrl =
  process.env.FIRST_SHOT_WEBPAGE_URL ?? "https://404.directory"
const headers = {
  "X-404-Agent-ID": "agent:00000000-0000-4000-8000-000000000404",
  "X-404-Agent-Class": "internal",
  "X-404-Source": "first-shot-smoke",
  "X-404-Client-Name": "first-shot-smoke",
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function jsonResponse(pathName: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  })
  assert(response.ok, `${pathName} returned HTTP ${response.status}`)
  return response.json() as Promise<Record<string, unknown>>
}

const health = await jsonResponse("/health")
const healthTools = Array.isArray(health.tools) ? health.tools : []
assert(
  healthTools.includes("evaluate_prediction_market"),
  "health tool inventory is missing evaluate_prediction_market"
)

const connect = await fetch(`${baseUrl}/connect.md?source=first-shot-smoke`)
const connectText = await connect.text()
assert(connect.ok, `/connect.md returned HTTP ${connect.status}`)
assert(
  connectText.includes('"name": "evaluate_prediction_market"'),
  "connect.md does not make prediction-market preflight the first forced call"
)
assert(
  /agent:[0-9a-f-]{36}/i.test(connectText),
  "connect.md does not generate a stable-installation Agent ID"
)

const understood = await jsonResponse("/understand", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: webpageUrl }),
})
assert(
  understood.page_type === "homepage",
  `understand_webpage classified the product homepage as ${String(understood.page_type)}`
)
const state = understood.state as Record<string, unknown> | undefined
assert(
  state?.login_status === "unknown",
  `understand_webpage inferred login_status=${String(state?.login_status)} without account evidence`
)

const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
  requestInit: { headers },
})
const client = new Client({ name: "first-shot-smoke", version: "1.0.0" })
try {
  await client.connect(transport)
  const tools = await client.listTools()
  assert(
    tools.tools.some((tool) => tool.name === "evaluate_prediction_market"),
    "MCP tools/list is missing evaluate_prediction_market"
  )
  const prompts = await client.listPrompts()
  assert(
    prompts.prompts[0]?.name === "preflight-prediction-market",
    `first MCP prompt is ${prompts.prompts[0]?.name ?? "missing"}`
  )
  const docs = await client.callTool({
    name: "search_official_docs",
    arguments: {
      query: "MCP Streamable HTTP",
      sources: ["openai"],
      limit_per_source: 2,
    },
  })
  assert(docs.isError !== true, "search_official_docs returned an error")
  const serializedDocs = JSON.stringify(docs.structuredContent ?? docs.content)
  assert(
    serializedDocs.length < 8_000,
    `search_official_docs returned ${serializedDocs.length} characters; first-shot budget is 8000`
  )
  assert(
    serializedDocs.includes("documents"),
    "search_official_docs did not return normalized citation documents"
  )
} finally {
  await client.close().catch(() => undefined)
  await transport.close().catch(() => undefined)
}

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      base_url: baseUrl,
      webpage_url: webpageUrl,
      version: health.version,
      tools: healthTools.length,
      checks: [
        "activation-parity",
        "identity-present",
        "homepage-classification",
        "mcp-first-prompt",
        "official-docs-context-budget",
      ],
    },
    null,
    2
  ) + "\n"
)
