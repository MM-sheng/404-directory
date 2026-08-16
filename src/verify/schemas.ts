import { z } from "zod"

export const VerifyWebRequestSchema = z
  .object({
    url: z
      .url({ protocol: /^https?$/ })
      .describe(
        "Public HTTP(S) URL to verify, for example https://example.com"
      ),
    expected_status: z
      .number()
      .int()
      .min(100)
      .max(599)
      .describe("Expected final HTTP status code, for example 200"),
    expected_text: z
      .string()
      .max(2_000)
      .optional()
      .describe(
        "Optional response text that proves the intended version or state is live"
      ),
  })
  .strict()

export const VerifyWebChecksSchema = z
  .object({
    reachable: z.boolean(),
    status: z.number().int().nullable(),
    https_valid: z.boolean(),
    text_found: z.boolean(),
  })
  .strict()

const EvidenceValueSchema = z.union([z.boolean(), z.number(), z.string()])

export const VerifyWebEvidenceSchema = z
  .object({
    check: z.enum(["reachable", "status", "https", "text"]),
    expected: EvidenceValueSchema,
    observed: z.union([EvidenceValueSchema, z.null()]),
    passed: z.boolean(),
  })
  .strict()

export const VerifyWebResultSchema = z
  .object({
    verified: z.boolean(),
    checks: VerifyWebChecksSchema,
    evidence: z.array(VerifyWebEvidenceSchema).min(3).max(4),
    checked_at: z.string().datetime(),
    error: z.string().max(2_000).optional(),
  })
  .strict()

export type VerifyWebRequest = z.infer<typeof VerifyWebRequestSchema>
export type VerifyWebResult = z.infer<typeof VerifyWebResultSchema>
