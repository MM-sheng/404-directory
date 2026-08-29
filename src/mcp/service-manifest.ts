import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { Tool, Prompt } from "@modelcontextprotocol/sdk/types.js"
import type { ToolRegistry } from "../tools/registry.js"
import { SERVICE_VERSION } from "../version.js"

export type ServiceManifest = {
  tools: Tool[]
  prompts: Prompt[]
  instructions: string
}

/** Read the actual registration contract without HTTP, handlers or analytics.
 * No private SDK fields and no second hand-maintained set of schemas.
 */
export async function readServiceManifest(
  server: McpServer
): Promise<ServiceManifest> {
  const client = new Client({
    name: "404-internal-manifest",
    version: SERVICE_VERSION,
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const capabilities = client.getServerCapabilities()
    const tools: Tool[] = []
    const prompts: Prompt[] = []
    if (capabilities?.tools) {
      let cursor: string | undefined
      do {
        const page = await client.listTools({ cursor })
        tools.push(...page.tools)
        cursor = page.nextCursor
      } while (cursor)
    }
    if (capabilities?.prompts) {
      let cursor: string | undefined
      do {
        const page = await client.listPrompts({ cursor })
        prompts.push(...page.prompts)
        cursor = page.nextCursor
      } while (cursor)
    }
    return { tools, prompts, instructions: client.getInstructions() ?? "" }
  } finally {
    await client.close()
    await server.close()
  }
}

type RestBinding = {
  method: "GET" | "POST"
  path: string
  input_mapping: string
}

// These are existing REST equivalents, not new endpoints or MCP argument schemas.
const REST_BINDINGS: Record<string, RestBinding> = {
  evaluate_tool_risk: {
    method: "POST",
    path: "/v1/evaluations",
    input_mapping: "Send the MCP arguments as the JSON body.",
  },
  evaluate_prediction_market: {
    method: "POST",
    path: "/v1/prediction-markets/evaluations",
    input_mapping: "Send the MCP arguments as the JSON body.",
  },
  report_tool_outcome: {
    method: "POST",
    path: "/v1/evaluations/{id}/outcome",
    input_mapping:
      "Put receipt_id in the id path segment; send remaining arguments, including the one-time outcome token, as JSON body.",
  },
  report_prediction_market_outcome: {
    method: "POST",
    path: "/v1/prediction-markets/evaluations/{id}/outcome",
    input_mapping:
      "Put receipt_id in the id path segment; send remaining arguments, including the one-time outcome token, as JSON body.",
  },
  search_tools: {
    method: "GET",
    path: "/v1/tools/search",
    input_mapping:
      "Encode arguments as URL query parameters. Public search exposes active/degraded records only.",
  },
  get_tool: {
    method: "GET",
    path: "/v1/tools/{idOrSlug}",
    input_mapping: "Put id_or_slug in the encoded idOrSlug path segment.",
  },
  compare_tools: {
    method: "GET",
    path: "/v1/tools/compare",
    input_mapping:
      "Encode ids_or_slugs as the comma-separated ids query parameter, not a JSON array.",
  },
  get_trust_score: {
    method: "GET",
    path: "/v1/tools/{idOrSlug}/trust",
    input_mapping: "Put id_or_slug in the encoded idOrSlug path segment.",
  },
  recommend_tools: {
    method: "GET",
    path: "/v1/tools/{idOrSlug}/related",
    input_mapping:
      "Put id_or_slug in the encoded idOrSlug path segment; limit is a query parameter.",
  },
  list_capabilities: {
    method: "GET",
    path: "/v1/capabilities",
    input_mapping:
      "No arguments. Lists ecosystem capability labels, not callable 404 tool names.",
  },
  get_capability_graph: {
    method: "GET",
    path: "/v1/graph/capabilities",
    input_mapping: "Encode arguments as URL query parameters.",
  },
}

export type ServiceToolEntry = {
  name: string
  title?: string
  description: string
  use_when: string
  href: string
  kind: "404_service_tool"
  version: string
  input_schema: Tool["inputSchema"]
  output_schema?: Tool["outputSchema"]
  annotations?: Tool["annotations"]
  invocation: {
    mcp: { endpoint: "/mcp"; method: "tools/call"; name: string }
    rest: RestBinding | null
  }
}

export function serviceToolEntries(
  manifest: ServiceManifest,
  registry: ToolRegistry
): ServiceToolEntry[] {
  return manifest.tools.map((tool) => {
    const native = registry.get(tool.name)
    return {
      ...(native ? registry.catalogEntry(tool.name) : {}),
      name: tool.name,
      title: tool.title,
      description: tool.description ?? tool.name,
      use_when: native?.use_when ?? tool.description ?? tool.name,
      href: `/tools/${encodeURIComponent(tool.name)}`,
      kind: "404_service_tool",
      version: native?.version ?? SERVICE_VERSION,
      input_schema: tool.inputSchema,
      output_schema: tool.outputSchema,
      annotations: tool.annotations,
      invocation: {
        mcp: { endpoint: "/mcp", method: "tools/call", name: tool.name },
        rest: native
          ? {
              method: native.method,
              path: native.endpoint,
              input_mapping: "Use the existing REST contract in /openapi.json.",
            }
          : (REST_BINDINGS[tool.name] ?? null),
      },
    }
  })
}
