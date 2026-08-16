import { z } from "zod"

export const VerifyWebRequestSchema = z
  .object({
    url: z.url({ protocol: /^https?$/ }),
    expected_status: z.number().int().min(100).max(599),
    expected_text: z.string().max(2_000).optional(),
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

export const VerifyWebResultSchema = z
  .object({
    verified: z.boolean(),
    checks: VerifyWebChecksSchema,
    checked_at: z.string().datetime(),
    error: z.string().max(2_000).optional(),
  })
  .strict()

export type VerifyWebRequest = z.infer<typeof VerifyWebRequestSchema>
export type VerifyWebResult = z.infer<typeof VerifyWebResultSchema>
