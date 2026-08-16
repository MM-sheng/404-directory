import type { UnderstandService } from "../../understand.js"
import {
  AgentPageModelSchema,
  UnderstandRequestSchema,
} from "../../schemas/agent-page-model.js"
import type { ToolDefinition } from "../types.js"

export function createUnderstandWebpageTool(
  service: UnderstandService
): ToolDefinition<typeof UnderstandRequestSchema, typeof AgentPageModelSchema> {
  return {
    name: "understand_webpage",
    description:
      "Turns an ordinary human-facing webpage into a compact, evidence-backed AgentPageModel: page type, entities, current state, available actions, and supporting evidence. Observes only — never clicks, logs in, orders, or pays.",
    use_when:
      "Use when you need to understand a webpage that has no Agent-native API — for example to identify products, forms, login walls, available actions, or page state before deciding the next step.",
    version: "0.1.0",
    endpoint: "/understand",
    method: "POST",
    status: "active",
    examples: [
      {
        description: "Understand a public documentation webpage",
        input: { url: "https://example.com" },
        output: {
          page_type: "homepage",
          summary: "Example Domain — documentation example page.",
          entities: [],
          state: { login_status: "unknown", properties: {} },
          actions: [],
          evidence: [
            {
              source: "title",
              field: "title",
              raw_value: "Example Domain",
            },
          ],
          confidence: 0.7,
        },
      },
    ],
    inputSchema: UnderstandRequestSchema,
    outputSchema: AgentPageModelSchema,
    handler: async ({ url }) => service.understand(url),
    mcp: {
      title: "Understand webpage",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
  }
}
