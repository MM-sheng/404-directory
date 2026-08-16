import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ToolRegistry } from "../tools/registry.js"

export function createMcpServerFromRegistry(registry: ToolRegistry): McpServer {
  const server = new McpServer({
    name: "404.directory",
    version: "0.2.0",
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
        try {
          const parsed = tool.inputSchema.parse(args)
          const result = await tool.handler(parsed)
          const validated = tool.outputSchema.parse(result)
          return {
            content: [{ type: "text", text: JSON.stringify(validated) }],
            structuredContent: validated as Record<string, unknown>,
          }
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text:
                  error instanceof Error ? error.message : "Tool execution failed",
              },
            ],
          }
        }
      }
    )
  }

  return server
}
