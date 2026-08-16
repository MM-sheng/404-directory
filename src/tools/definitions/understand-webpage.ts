import type { UnderstandService } from "../../understand.js"
import {
  AgentPageModelSchema,
  UnderstandRequestSchema,
} from "../../schemas/agent-page-model.js"
import type { ToolDefinition } from "../types.js"
import { linkPageModelEvidence } from "../../evidence/link-page-model.js"

export function createUnderstandWebpageTool(
  service: UnderstandService
): ToolDefinition<typeof UnderstandRequestSchema, typeof AgentPageModelSchema> {
  return {
    name: "understand_webpage",
    description:
      "Turns an ordinary human-facing webpage into a compact, evidence-backed AgentPageModel: page type, entities, current state, available actions, and supporting evidence. Observes only — never clicks, logs in, orders, or pays.",
    use_when:
      "Use when you need to understand a webpage that has no Agent-native API — for example to identify products, forms, login walls, available actions, or page state before deciding the next step.",
    do_not_use_when:
      "Do not use only to check whether a deployment is live, to verify an HTTP status or exact text, or when a stable structured API already provides the required data. It cannot access private or authenticated pages.",
    version: "0.2.0",
    endpoint: "/understand",
    method: "POST",
    status: "active",
    read_only: true,
    side_effects: [],
    requires_auth: false,
    cost: "free",
    typical_latency_ms: 5000,
    examples: [
      {
        description: "Understand a public documentation webpage",
        input: { url: "https://example.com" },
        output: {
          page_type: "homepage",
          summary: "Example Domain — documentation example page.",
          entities: [],
          state: {
            login_status: "unknown",
            properties: {},
            evidence_ids: ["e1"],
          },
          actions: [],
          evidence: [
            {
              id: "e1",
              source: "title",
              field: "title",
              raw_value: "Example Domain",
              supports: ["state"],
            },
          ],
          confidence: 0.7,
        },
      },
    ],
    inputSchema: UnderstandRequestSchema,
    outputSchema: AgentPageModelSchema,
    handler: async ({ url }) =>
      linkPageModelEvidence(await service.understand(url)),
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
