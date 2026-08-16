import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ToolRegistry } from "../tools/registry.js"
import { SERVICE_VERSION } from "../version.js"

export function createMcpServerFromRegistry(registry: ToolRegistry): McpServer {
  const server = new McpServer({
    name: "404.directory",
    version: SERVICE_VERSION,
  })

  for (const tool of registry.listActive()) {
    server.registerTool(
      tool.name,
      {
        title: tool.mcp?.title ?? tool.name,
        description: `${tool.description}\n\nWhen to use: ${tool.use_when}`,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.mcp?.annotations,
      },
      async (args) => {
        let parsed: unknown
        try {
          parsed = tool.inputSchema.parse(args)
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text:
                  error instanceof Error ? error.message : "Invalid tool input",
              },
            ],
          }
        }

        try {
          const result = await tool.handler(parsed)
          const validated = tool.outputSchema.parse(result)
          return {
            content: [{ type: "text", text: JSON.stringify(validated) }],
            structuredContent: validated as Record<string, unknown>,
          }
        } catch {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "Tool execution failed",
              },
            ],
          }
        }
      }
    )
  }

  return server
}
