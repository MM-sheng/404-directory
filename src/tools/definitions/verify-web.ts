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
      "Use when the user explicitly asks to verify a deployment claim, public reachability, final HTTP status, HTTPS/TLS, redirects, or exact expected text. Prefer expected_text that distinguishes the new version (build id, version string, unique copy).",
    do_not_use_when:
      "Do not call this merely before or alongside understand_webpage to prove that its target is reachable; a successful understand_webpage result already proves the page was fetched. Do not use to extract entities, forms, actions, or meaning, for private/internal URLs, or for subjective visual-quality judgments.",
    version: "0.3.0",
    endpoint: "/verify/web",
    method: "POST",
    status: "active",
    read_only: true,
    side_effects: [],
    requires_auth: false,
    cost: "free",
    typical_latency_ms: 1200,
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
          evidence: {
            requested_url: "https://example.com",
            final_url: "https://example.com/",
            http: { status: 200, expected_status: 200, matched: true },
            expected_text: {
              value: "Example Domain",
              checked: true,
              matched: true,
            },
            tls: { requested: true, valid: true },
            redirects: { count: 0, chain: [] },
            checked_at: "2026-08-16T08:50:33.986Z",
            claims: [
              {
                claim: "reachable",
                passed: true,
                evidence_paths: ["http.status", "final_url"],
              },
              {
                claim: "status_matches",
                passed: true,
                evidence_paths: ["http.status", "http.expected_status"],
              },
              {
                claim: "https_valid",
                passed: true,
                evidence_paths: ["tls.requested", "tls.valid"],
              },
              {
                claim: "expected_text_found",
                passed: true,
                evidence_paths: [
                  "expected_text.value",
                  "expected_text.matched",
                ],
              },
            ],
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
