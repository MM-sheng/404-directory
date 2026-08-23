import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

const serverUrl = process.argv[2] ?? "https://404.directory/mcp"
const client = new Client({
  name: "404-directory-smoke",
  version: "1.0.0",
})
const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
  requestInit: {
    headers: {
      "X-404-Agent-ID": "agent:internal-release-smoke",
      "X-404-Agent-Class": "internal",
      "X-404-Source": "release-smoke",
      "X-404-Client-Name": "404-directory-smoke",
    },
  },
})

try {
  // connect() performs the MCP initialize handshake and sends initialized.
  await client.connect(transport)
  const listed = await client.listTools()
  const names = listed.tools.map((tool) => tool.name)
  for (const required of [
    "understand_webpage",
    "verify_web",
    "search_tools",
    "get_tool",
    "compare_tools",
    "get_trust_score",
    "recommend_tools",
    "list_capabilities",
    "get_capability_graph",
    "search_official_docs",
    "inspect_tool_server",
    "invoke_registered_tool",
  ]) {
    if (!names.includes(required)) {
      throw new Error(`Missing MCP tool: ${required}`)
    }
  }

  const verify = await client.callTool({
    name: "verify_web",
    arguments: {
      url: "https://example.com",
      expected_status: 200,
      expected_text: "Example Domain",
    },
  })
  if (verify.isError || !verify.structuredContent) {
    throw new Error("verify_web MCP call failed")
  }

  const docs = await client.callTool({
    name: "search_official_docs",
    arguments: {
      query: "MCP Streamable HTTP protocol version header",
      sources: ["microsoft"],
      limit_per_source: 1,
    },
  })
  if (docs.isError || !docs.structuredContent) {
    throw new Error("search_official_docs MCP call failed")
  }

  const search = await client.callTool({
    name: "search_tools",
    arguments: { q: "web", limit: 3 },
  })
  if (search.isError || !search.structuredContent) {
    throw new Error("search_tools MCP call failed")
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        handshake: {
          server: client.getServerVersion(),
          capabilities: client.getServerCapabilities(),
        },
        tools_list: names,
        tools_call: {
          verify_web: verify.structuredContent,
          search_official_docs: docs.structuredContent,
          search_tools: search.structuredContent,
        },
      },
      null,
      2
    )}\n`
  )
} finally {
  await client.close()
}
