import type { AppConfig } from "../config.js"
import { zodToJsonSchema } from "../tools/json-schema.js"
import type { ToolRegistry } from "../tools/registry.js"
import type { CatalogStore } from "./store.js"
import { refreshTrustForTool } from "./trust.js"
import type { RegisterToolRequest } from "./types.js"

const FIRST_PARTY_PROVIDER = {
  name: "404.directory",
  slug: "404-directory",
  website_url: "https://404.directory",
  identity: { type: "domain" as const, value: "404.directory" },
}

/**
 * Maps first-party executable ToolDefinitions into the ecosystem catalog so
 * Agent search/discovery returns the same tools agents can already invoke.
 */
export async function seedFirstPartyTools(
  store: CatalogStore,
  registry: ToolRegistry,
  config: AppConfig
): Promise<{ seeded: string[] }> {
  const base = config.PUBLIC_BASE_URL.replace(/\/$/, "")
  const seeded: string[] = []

  for (const tool of registry.listActive()) {
    const absoluteEndpoint = tool.endpoint.startsWith("http")
      ? tool.endpoint
      : `${base}${tool.endpoint.startsWith("/") ? "" : "/"}${tool.endpoint}`

    const capabilities = deriveCapabilities(tool.name, tool.description)
    const input: RegisterToolRequest = {
      name: tool.name,
      description: tool.description,
      capabilities,
      protocol: "api",
      endpoint: absoluteEndpoint,
      category: "first-party",
      version: tool.version,
      authentication: tool.requires_auth ? "api_key" : "none",
      transport: "http",
      provider: FIRST_PARTY_PROVIDER,
      input_schema: zodToJsonSchema(tool.inputSchema),
      output_schema: zodToJsonSchema(tool.outputSchema),
      metadata: {
        first_party: true,
        use_when: tool.use_when,
        do_not_use_when: tool.do_not_use_when,
        mcp_also: true,
      },
    }

    const catalogTool = await store.ensureTool(input, {
      status: "active",
      providerVerified: true,
    })
    await refreshTrustForTool(store, catalogTool.id)
    seeded.push(catalogTool.slug)
  }

  // Also publish the MCP discovery endpoint as a catalog entry for protocol search.
  const mcpTool = await store.ensureTool(
    {
      name: "404_mcp",
      description:
        "404.directory MCP Streamable HTTP endpoint. Discover and call first-party tools plus ecosystem search_tools / get_tool / compare_tools / get_trust_score.",
      capabilities: ["mcp", "discovery", "trust", "tool-search"],
      protocol: "mcp",
      endpoint: `${base}/mcp`,
      category: "first-party",
      version: "0.1.0",
      authentication: "none",
      transport: "mcp_http",
      provider: FIRST_PARTY_PROVIDER,
      metadata: { first_party: true },
    },
    { status: "active", providerVerified: true }
  )
  await refreshTrustForTool(store, mcpTool.id)
  seeded.push(mcpTool.slug)

  return { seeded }
}

function deriveCapabilities(name: string, description: string): string[] {
  const caps = new Set<string>([name.replace(/_/g, "-")])
  if (/verify|https|deploy|tls/i.test(`${name} ${description}`)) {
    caps.add("web-verification")
    caps.add("https")
    caps.add("deployment-check")
  }
  if (/understand|webpage|page|entities|forms/i.test(`${name} ${description}`)) {
    caps.add("webpage-understanding")
    caps.add("page-state")
    caps.add("entities")
  }
  return [...caps].slice(0, 16)
}
