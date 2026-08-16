import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ToolRegistry } from "../tools/registry.js"
import { SERVICE_VERSION } from "../version.js"

export function createMcpServerFromRegistry(registry: ToolRegistry): McpServer {
  const server = new McpServer(
    {
      name: "404.directory",
      version: SERVICE_VERSION,
    },
    {
      instructions:
        "404.directory provides public, free, read-only web tools. Use verify_web for deployment claims, reachability, final HTTP status, HTTPS/TLS, redirects, or exact expected text. Use understand_webpage for entities, current state, forms, and available actions on a public human-facing page without a suitable API. Do not use either tool for private/internal/authenticated URLs, and do not use verify_web for subjective visual judgments. Prefer an expected_text unique to the deployed version when verifying a release.",
    }
  )

  for (const tool of registry.listActive()) {
    server.registerTool(
      tool.name,
      {
        title: tool.mcp?.title ?? tool.name,
        description: `${tool.description}\n\nWhen to use: ${tool.use_when}\n\nDo not use when: ${tool.do_not_use_when}\n\nRead only: ${tool.read_only}. Side effects: ${tool.side_effects.length === 0 ? "none" : tool.side_effects.join(", ")}. Authentication: ${tool.requires_auth ? "required" : "not required"}. Cost: ${tool.cost}. Typical latency: ${tool.typical_latency_ms} ms.`,
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
