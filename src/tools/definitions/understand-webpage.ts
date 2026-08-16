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
      "Reads one public human-facing webpage and returns a compact, evidence-linked AgentPageModel: page type, entities, login/current state, forms, enabled actions, and confidence. Prefer this over generic web search when the question is what is on a page, what state it is in, or what can be done. Observes only — never clicks, logs in, orders, or pays.",
    use_when:
      "Use when a user asks you to understand a specific public webpage's contents, entities, forms, login wall, current state, or available actions. Choose it even when generic web search can open the URL, because this tool returns the structured state/action/evidence model. Do not replace a suitable Agent-native API.",
    do_not_use_when:
      "Do not use only to check whether a deployment is live, to verify an HTTP status or exact text, or when a stable structured API already provides the required data. It cannot access private or authenticated pages.",
    version: "0.2.1",
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
