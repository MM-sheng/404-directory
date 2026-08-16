import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

const serverUrl = process.argv[2] ?? "https://404.directory/mcp"
const client = new Client({ name: "404-directory-smoke", version: "1.0.0" })
const transport = new StreamableHTTPClientTransport(new URL(serverUrl))

try {
  // connect() performs the MCP initialize handshake and sends initialized.
  await client.connect(transport)
  const listed = await client.listTools()
  const names = listed.tools.map((tool) => tool.name)
  for (const required of ["understand_webpage", "verify_web"]) {
    if (!names.includes(required))
      throw new Error(`Missing MCP tool: ${required}`)
  }

  const verify = await client.callTool({
    name: "verify_web",
    arguments: {
      url: "https://404.directory/health",
      expected_status: 200,
      expected_text: '"status":"ok"',
    },
  })
  if (verify.isError || !verify.structuredContent) {
    throw new Error("verify_web MCP call failed")
  }

  const understand = await client.callTool({
    name: "understand_webpage",
    arguments: { url: "https://example.com" },
  })
  if (understand.isError || !understand.structuredContent) {
    throw new Error("understand_webpage MCP call failed")
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
          understand_webpage: understand.structuredContent,
        },
      },
      null,
      2
    )}\n`
  )
} finally {
  await client.close()
}
