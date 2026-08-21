import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

const serverUrl = process.argv[2] ?? "https://404.directory/mcp"
const client = new Client({
  name: "404-directory-gateway-smoke-agent",
  version: "1.0.0",
})
const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
  requestInit: {
    headers: {
      "X-404-Agent-ID": "internal:gateway-smoke-agent",
      "X-404-Agent-Class": "internal",
      "X-404-Source": "release-smoke",
    },
  },
})

function textOf(result: { content?: unknown }): string {
  if (!Array.isArray(result.content)) return ""
  return result.content
    .filter((item): item is { type: "text"; text: string } =>
      Boolean(
        item &&
        typeof item === "object" &&
        (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string"
      )
    )
    .map((item) => item.text)
    .join("\n")
}

try {
  await client.connect(transport)
  const listed = await client.listTools()
  const names = listed.tools.map((tool) => tool.name)
  for (const required of [
    "search_tools",
    "inspect_tool_server",
    "invoke_registered_tool",
  ]) {
    if (!names.includes(required)) {
      throw new Error(`Missing MCP tool: ${required}`)
    }
  }

  const discovered = await client.callTool({
    name: "search_tools",
    arguments: {
      q: "OpenAI developer documentation",
      protocol: "mcp",
      limit: 5,
    },
  })
  if (discovered.isError || !textOf(discovered).includes("openai_docs_mcp")) {
    throw new Error(
      "openai_docs_mcp is not active in discovery; wait for verification and retry"
    )
  }

  const inspected = await client.callTool({
    name: "inspect_tool_server",
    arguments: { id_or_slug: "openai_docs_mcp" },
  })
  if (inspected.isError || !textOf(inspected).includes("search_openai_docs")) {
    throw new Error("Gateway inspection failed")
  }

  const invoked = await client.callTool({
    name: "invoke_registered_tool",
    arguments: {
      server_id_or_slug: "openai_docs_mcp",
      tool_name: "search_openai_docs",
      arguments: { query: "Responses API remote MCP", limit: 2 },
    },
  })
  if (invoked.isError) throw new Error("Gateway invocation failed")

  process.stdout.write(
    `${JSON.stringify(
      {
        server: client.getServerVersion(),
        discovered: "openai_docs_mcp",
        inspected: "search_openai_docs",
        invoked: true,
        result_preview: textOf(invoked).slice(0, 500),
      },
      null,
      2
    )}\n`
  )
} finally {
  await client.close()
}
