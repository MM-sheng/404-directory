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

const RedirectEvidenceSchema = z
  .object({
    status: z.number().int().min(300).max(399),
    from: z.url({ protocol: /^https?$/ }),
    to: z.url({ protocol: /^https?$/ }),
  })
  .strict()

const ClaimEvidenceSchema = z
  .object({
    claim: z.enum([
      "reachable",
      "status_matches",
      "https_valid",
      "expected_text_found",
    ]),
    passed: z.boolean(),
    evidence_paths: z.array(z.string()).min(1).max(4),
  })
  .strict()

export const VerifyWebEvidenceSchema = z
  .object({
    requested_url: z.url({ protocol: /^https?$/ }),
    final_url: z.url({ protocol: /^https?$/ }).nullable(),
    http: z
      .object({
        status: z.number().int().nullable(),
        expected_status: z.number().int().min(100).max(599),
        matched: z.boolean(),
      })
      .strict(),
    expected_text: z
      .object({
        value: z.string().max(2_000).nullable(),
        checked: z.boolean(),
        matched: z.boolean().nullable(),
      })
      .strict(),
    tls: z
      .object({
        requested: z.boolean(),
        valid: z.boolean(),
      })
      .strict(),
    redirects: z
      .object({
        count: z.number().int().nonnegative(),
        chain: z.array(RedirectEvidenceSchema).max(10),
      })
      .strict(),
    checked_at: z.string().datetime(),
    claims: z.array(ClaimEvidenceSchema).min(3).max(4),
  })
  .strict()

export const VerifyWebResultSchema = z
  .object({
    verified: z.boolean(),
    checks: VerifyWebChecksSchema,
    evidence: VerifyWebEvidenceSchema,
    checked_at: z.string().datetime(),
    error: z.string().max(2_000).optional(),
  })
  .strict()

export type VerifyWebRequest = z.infer<typeof VerifyWebRequestSchema>
export type VerifyWebResult = z.infer<typeof VerifyWebResultSchema>
