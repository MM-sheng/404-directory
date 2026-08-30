import { createHmac } from "node:crypto"
import { z } from "zod"
import { hashAgentInstallationId } from "./agent-attribution.js"

export const VerificationMethodSchema = z.enum([
  "maintainer_confirmed",
  "partner_attested",
  "pilot_interview",
  "marketplace_verified",
])

export const VerifiedAgentAdmissionRequestSchema = z
  .object({
    agent_id: z
      .string()
      .regex(
        /^agent:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:@[a-z0-9][a-z0-9._-]{0,63})?$/i
      ),
    operator_id: z
      .string()
      .regex(
        /^operator:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      ),
    source: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
    verification_method: VerificationMethodSchema,
    evidence_ref: z.url().max(2_048),
  })
  .strict()

export type VerifiedAgentAdmissionRequest = z.infer<
  typeof VerifiedAgentAdmissionRequestSchema
>

function scopedDigest(
  prefix: "o1" | "e1",
  scope: string,
  value: string,
  salt: string
): string {
  return `${prefix}_${createHmac("sha256", salt)
    .update(`${scope}:${value}`)
    .digest("hex")
    .slice(0, 40)}`
}

export function verifiedAgentAdmissionDigests(
  request: VerifiedAgentAdmissionRequest,
  salt: string
): { agent_key: string; operator_key: string; evidence_ref_hash: string } {
  const agentKey = hashAgentInstallationId(request.agent_id, salt)
  if (!agentKey) throw new Error("Invalid Agent installation ID")
  return {
    agent_key: agentKey,
    operator_key: scopedDigest(
      "o1",
      "verified-operator",
      request.operator_id,
      salt
    ),
    evidence_ref_hash: scopedDigest(
      "e1",
      "verified-evidence",
      request.evidence_ref,
      salt
    ),
  }
}
