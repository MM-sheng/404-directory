import {
  VerifyWebRequestSchema,
  VerifyWebResultSchema,
} from "../../verify/schemas.js"
import { verifyWeb, type VerifyWebOptions } from "../../verify/verify.js"
import type { ToolDefinition } from "../types.js"

export function createVerifyWebTool(
  options: VerifyWebOptions
): ToolDefinition<typeof VerifyWebRequestSchema, typeof VerifyWebResultSchema> {
  return {
    name: "verify_web",
    description:
      "Independently verifies that a public website is reachable and meets deployment expectations (HTTP status, HTTPS validity, optional expected text). Returns structured evidence for accept / retry / escalate decisions.",
    use_when:
      "Use after another agent, coding agent, or deploy system claims a site is live or updated. Prefer including expected_text that distinguishes the new version (build id, version string, unique copy).",
    version: "0.1.0",
    endpoint: "/verify/web",
    method: "POST",
    status: "active",
    examples: [
      {
        description: "Verify a deployment and version-specific page text",
        input: {
          url: "https://example.com",
          expected_status: 200,
          expected_text: "Example Domain",
        },
        output: {
          verified: true,
          checks: {
            reachable: true,
            status: 200,
            https_valid: true,
            text_found: true,
          },
          checked_at: "2026-08-16T08:50:33.986Z",
        },
      },
    ],
    inputSchema: VerifyWebRequestSchema,
    outputSchema: VerifyWebResultSchema,
    handler: async (input) => verifyWeb(input, options),
    mcp: {
      title: "Verify web",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
  }
}
