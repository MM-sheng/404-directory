import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

const serverUrl = process.argv[2] ?? "https://404.directory/mcp"
const client = new Client({
  name: "404-directory-openai-review",
  version: "1.0.0",
})
const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
  requestInit: {
    headers: {
      "X-404-Agent-Class": "internal",
      "X-404-Source": "openai-review-smoke",
    },
  },
})

function requireCondition(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) throw new Error(message)
}

async function expectSuccessfulTool(
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: args })
  requireCondition(!result.isError, `${name} returned an MCP error`)
  requireCondition(
    result.structuredContent && typeof result.structuredContent === "object",
    `${name} did not return structured content`
  )
  return result.structuredContent as Record<string, unknown>
}

async function expectRejectedTool(
  name: string,
  args: Record<string, unknown>
): Promise<void> {
  const result = await client.callTool({ name, arguments: args })
  requireCondition(result.isError === true, `${name} unexpectedly accepted input`)
}

try {
  await client.connect(transport)
  const listed = await client.listTools()
  requireCondition(listed.tools.length === 12, "Expected exactly 12 MCP tools")
  for (const tool of listed.tools) {
    requireCondition(
      tool.annotations?.readOnlyHint === true,
      `${tool.name} must declare readOnlyHint: true`
    )
    requireCondition(
      tool.annotations?.destructiveHint === false,
      `${tool.name} must declare destructiveHint: false`
    )
    requireCondition(
      typeof tool.annotations?.openWorldHint === "boolean",
      `${tool.name} must declare openWorldHint`
    )
  }

  const openAiDocs = await expectSuccessfulTool("search_official_docs", {
    query: "remote MCP servers in the Responses API",
    sources: ["openai"],
    limit_per_source: 3,
  })
  requireCondition(
    Array.isArray(openAiDocs.successful_sources) &&
      openAiDocs.successful_sources.includes("openai"),
    "OpenAI official documentation search had no successful source"
  )

  const awsDocs = await expectSuccessfulTool("search_official_docs", {
    query: "choose an AWS region for Amazon Bedrock workloads",
    sources: ["aws"],
    limit_per_source: 3,
  })
  requireCondition(
    Array.isArray(awsDocs.successful_sources) &&
      awsDocs.successful_sources.includes("aws"),
    "AWS official documentation search had no successful source"
  )

  const trust = await expectSuccessfulTool("get_trust_score", {
    id_or_slug: "openai_docs_mcp",
  })
  requireCondition(
    trust.trust && typeof trust.trust === "object",
    "Trust profile is missing"
  )

  const verification = await expectSuccessfulTool("verify_web", {
    url: "https://404.directory/health",
    expected_status: 200,
    expected_text: '"version":"0.9.0"',
  })
  requireCondition(
    verification.verified === true,
    "Deployment verification did not pass"
  )

  const page = await expectSuccessfulTool("understand_webpage", {
    url: "https://example.com",
  })
  requireCondition(
    typeof page.summary === "string" && Array.isArray(page.evidence),
    "Page understanding result is incomplete"
  )

  await expectRejectedTool("understand_webpage", {
    url: "http://127.0.0.1:8080/admin",
  })
  await expectRejectedTool("invoke_registered_tool", {
    server_id_or_slug: "unverified-server",
    tool_name: "delete_database",
    arguments: {},
  })

  const verifyMetadata = listed.tools.find(
    (tool) => tool.name === "verify_web"
  )?.description
  requireCondition(
    verifyMetadata?.includes("subjective visual-quality judgments"),
    "verify_web metadata must reject subjective visual-quality judgments"
  )

  process.stdout.write(
    `${JSON.stringify(
      {
        reviewed_at: new Date().toISOString(),
        server: client.getServerVersion(),
        tool_count: listed.tools.length,
        annotations_checked: listed.tools.length,
        positive_tests: {
          openai_official_docs: "passed",
          aws_official_docs: "passed",
          trust_profile: "passed",
          deployment_verification: "passed",
          webpage_understanding: "passed",
        },
        negative_tests: {
          private_network_target: "rejected",
          destructive_unverified_invocation: "rejected",
          subjective_visual_verification: "excluded_by_tool_metadata",
        },
        attribution: "internal; excluded from external Agent metrics",
      },
      null,
      2
    )}\n`
  )
} finally {
  await client.close()
}
