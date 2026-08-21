import type { CatalogStore } from "./store.js"
import { refreshTrustForTool } from "./trust.js"
import type { RegisterToolRequest } from "./types.js"

type CuratedMcpServer = {
  registration: RegisterToolRequest
  providerSlug: string
  sourceUrl: string
  allowedTools: string[]
}

const REVIEWED_AT = "2026-08-21"

/**
 * Small, operator-reviewed launch set. These are public Streamable HTTP MCP
 * servers with read-only tools that passed initialize, tools/list, and a real
 * tools/call during the review noted above.
 */
export const CURATED_MCP_SERVERS: readonly CuratedMcpServer[] = [
  {
    providerSlug: "openai",
    sourceUrl: "https://developers.openai.com/mcp",
    allowedTools: [
      "search_openai_docs",
      "list_openai_docs",
      "fetch_openai_doc",
      "list_api_endpoints",
      "get_openapi_spec",
    ],
    registration: {
      name: "openai_docs_mcp",
      description:
        "Official OpenAI developer documentation MCP server for current API, SDK, ChatGPT, and Codex documentation. Agents can search, list, and fetch exact documentation plus inspect current OpenAPI endpoint specifications.",
      capabilities: [
        "documentation-search",
        "openai-api",
        "openapi",
        "code-assistance",
      ],
      protocol: "mcp",
      endpoint: "https://developers.openai.com/mcp",
      category: "developer-tools",
      version: REVIEWED_AT,
      authentication: "none",
      transport: "mcp_http",
      provider: {
        name: "OpenAI",
        slug: "openai",
        website_url: "https://openai.com",
        identity: { type: "domain", value: "openai.com" },
      },
    },
  },
  {
    providerSlug: "hugging-face",
    sourceUrl: "https://huggingface.co/docs/hub/agents-mcp",
    allowedTools: ["hub_repo_search", "hub_repo_details"],
    registration: {
      name: "hugging_face_mcp",
      description:
        "Official Hugging Face Hub MCP server for discovering and inspecting public models, datasets, and Spaces. The 404.directory gateway exposes only the public repository search and detail tools from this server.",
      capabilities: [
        "model-discovery",
        "dataset-discovery",
        "hugging-face",
        "ai-resources",
      ],
      protocol: "mcp",
      endpoint: "https://huggingface.co/mcp",
      category: "ai-resources",
      version: REVIEWED_AT,
      authentication: "none",
      transport: "mcp_http",
      provider: {
        name: "Hugging Face",
        slug: "hugging-face",
        website_url: "https://huggingface.co",
        identity: { type: "domain", value: "huggingface.co" },
      },
    },
  },
  {
    providerSlug: "deepwiki",
    sourceUrl: "https://docs.devin.ai/work-with-devin/deepwiki-mcp",
    allowedTools: ["ask_question", "read_wiki_contents", "read_wiki_structure"],
    registration: {
      name: "deepwiki_mcp",
      description:
        "Official DeepWiki public-repository MCP server. Agents can inspect a GitHub repository's generated documentation structure and contents or ask a repository-grounded question without requiring credentials.",
      capabilities: [
        "repository-understanding",
        "github",
        "code-documentation",
        "code-assistance",
      ],
      protocol: "mcp",
      endpoint: "https://mcp.deepwiki.com/mcp",
      category: "developer-tools",
      version: REVIEWED_AT,
      authentication: "none",
      transport: "mcp_http",
      provider: {
        name: "DeepWiki",
        slug: "deepwiki",
        website_url: "https://deepwiki.com",
        identity: { type: "domain", value: "deepwiki.com" },
      },
    },
  },
  {
    providerSlug: "microsoft-learn",
    sourceUrl: "https://learn.microsoft.com/en-us/training/support/mcp",
    allowedTools: [
      "microsoft_docs_search",
      "microsoft_code_sample_search",
      "microsoft_docs_fetch",
    ],
    registration: {
      name: "microsoft_learn_mcp",
      description:
        "Official Microsoft Learn MCP server for searching current Microsoft documentation and code samples and fetching complete documentation pages. It is public, free, and does not require authentication.",
      capabilities: [
        "documentation-search",
        "microsoft",
        "code-samples",
        "cloud-documentation",
      ],
      protocol: "mcp",
      endpoint: "https://learn.microsoft.com/api/mcp",
      category: "developer-tools",
      version: REVIEWED_AT,
      authentication: "none",
      transport: "mcp_http",
      provider: {
        name: "Microsoft Learn",
        slug: "microsoft-learn",
        website_url: "https://learn.microsoft.com",
        identity: { type: "domain", value: "learn.microsoft.com" },
      },
    },
  },
  {
    providerSlug: "aws",
    sourceUrl:
      "https://aws.amazon.com/about-aws/whats-new/2025/07/aws-knowledge-mcp-server-available-preview/",
    allowedTools: [
      "aws___read_documentation",
      "aws___search_documentation",
      "aws___list_regions",
      "aws___get_regional_availability",
      "aws___retrieve_skill",
    ],
    registration: {
      name: "aws_knowledge_mcp",
      description:
        "Official AWS Knowledge MCP server for authoritative AWS documentation, regional availability, product guidance, and agent skills. The public endpoint is available without an AWS account or authentication.",
      capabilities: [
        "documentation-search",
        "aws",
        "cloud-regions",
        "cloud-architecture",
      ],
      protocol: "mcp",
      endpoint: "https://knowledge-mcp.global.api.aws",
      category: "cloud-infrastructure",
      version: REVIEWED_AT,
      authentication: "none",
      transport: "mcp_http",
      provider: {
        name: "Amazon Web Services",
        slug: "aws",
        website_url: "https://aws.amazon.com",
        identity: { type: "domain", value: "aws.amazon.com" },
      },
    },
  },
  {
    providerSlug: "cloudflare",
    sourceUrl:
      "https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/",
    allowedTools: [
      "search_cloudflare_documentation",
      "migrate_pages_to_workers_guide",
    ],
    registration: {
      name: "cloudflare_docs_mcp",
      description:
        "Official Cloudflare documentation MCP server for current Cloudflare product guidance and Pages-to-Workers migration information. Only its public read-only documentation tools are executable through 404.directory.",
      capabilities: [
        "documentation-search",
        "cloudflare",
        "edge-computing",
        "workers",
      ],
      protocol: "mcp",
      endpoint: "https://docs.mcp.cloudflare.com/mcp",
      category: "cloud-infrastructure",
      version: REVIEWED_AT,
      authentication: "none",
      transport: "mcp_http",
      provider: {
        name: "Cloudflare",
        slug: "cloudflare",
        website_url: "https://cloudflare.com",
        identity: { type: "domain", value: "cloudflare.com" },
      },
    },
  },
] as const

export async function seedCuratedMcpServers(
  store: CatalogStore
): Promise<{ seeded: string[] }> {
  const seeded: string[] = []

  for (const candidate of CURATED_MCP_SERVERS) {
    const input: RegisterToolRequest = {
      ...candidate.registration,
      metadata: {
        curated: true,
        source_url: candidate.sourceUrl,
        reviewed_at: REVIEWED_AT,
        gateway: {
          enabled: true,
          mode: "read_only_allowlist",
          allowed_tools: candidate.allowedTools,
          external_content_is_untrusted: true,
        },
      },
    }

    // Existing lifecycle status is preserved. New entries begin pending and
    // the verification worker activates them only after live MCP admission.
    const tool = await store.ensureTool(input)
    await store.setProviderVerified(candidate.providerSlug, true, {
      ownership_method: "operator_curated_official_domain",
      curation_source: candidate.sourceUrl,
      curated_at: REVIEWED_AT,
    })
    await refreshTrustForTool(store, tool.id)
    seeded.push(tool.slug)
  }

  return { seeded }
}
