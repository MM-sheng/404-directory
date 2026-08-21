import type { CatalogStore } from "./store.js"
import type { TrustProfile, VerificationCheckRecord } from "./types.js"

export const TRUST_ALGORITHM_VERSION = "v1"

/**
 * Trust Profile v1 — machine-readable dimensions, not a single opaque score.
 * Factors are retained so future algorithms can recompute without schema changes.
 */
export function computeTrustProfile(input: {
  providerVerified: boolean
  ownershipMethod?: string | null
  checks: VerificationCheckRecord[]
  usage: { invocations: number; successes: number }
}): TrustProfile {
  const latestByType = new Map<string, VerificationCheckRecord>()
  for (const check of input.checks) {
    if (!latestByType.has(check.check_type)) {
      latestByType.set(check.check_type, check)
    }
  }

  const passRatio = (types: string[]): number => {
    if (types.length === 0) return 0
    const scores = types.map((type): number => {
      const check = latestByType.get(type)
      if (!check) return 0
      if (check.status === "pass") return 1
      if (check.status === "warn") return 0.5
      return 0
    })
    return scores.reduce((a, b) => a + b, 0) / types.length
  }

  // Ownership ladder: first-party > dns_txt > github_bio > generic verified > unverified
  let ownershipScore = 0.35
  if (input.providerVerified) {
    if (input.ownershipMethod === "first_party") ownershipScore = 1
    else if (input.ownershipMethod === "dns_txt") ownershipScore = 0.95
    else if (input.ownershipMethod === "github_bio") ownershipScore = 0.9
    else ownershipScore = 0.8
  }
  const availabilityScore = passRatio([
    "endpoint_availability",
    "latency",
    "error_rate",
  ])
  const compatibilityScore = passRatio([
    "mcp_handshake",
    "tools_list",
    "schema_consistency",
  ])
  const securityScore = passRatio(["tls_security"])
  const usageScore =
    input.usage.invocations === 0
      ? 0.2
      : Math.min(
          1,
          0.3 +
            Math.log10(input.usage.invocations + 1) / 4 +
            (input.usage.successes / input.usage.invocations) * 0.4
        )

  const overallScore = Number(
    (
      ownershipScore * 0.15 +
      availabilityScore * 0.3 +
      compatibilityScore * 0.25 +
      securityScore * 0.2 +
      usageScore * 0.1
    ).toFixed(4)
  )

  return {
    ownership_score: Number(ownershipScore.toFixed(4)),
    availability_score: Number(availabilityScore.toFixed(4)),
    compatibility_score: Number(compatibilityScore.toFixed(4)),
    security_score: Number(securityScore.toFixed(4)),
    usage_score: Number(usageScore.toFixed(4)),
    overall_score: overallScore,
    algorithm_version: TRUST_ALGORITHM_VERSION,
    factors: {
      provider_verified: input.providerVerified,
      ownership_method: input.ownershipMethod ?? null,
      checks_considered: [...latestByType.keys()],
      weights: {
        ownership: 0.15,
        availability: 0.3,
        compatibility: 0.25,
        security: 0.2,
        usage: 0.1,
      },
      usage_window: "7d",
      invocations: input.usage.invocations,
      successes: input.usage.successes,
    },
    computed_at: new Date().toISOString(),
  }
}

export async function refreshTrustForTool(
  store: CatalogStore,
  toolId: string
): Promise<TrustProfile | null> {
  const tool = await store.getToolById(toolId)
  if (!tool) return null

  const provider = await store.getProviderBySlug(tool.provider.slug)
  const ownershipMethod =
    typeof provider?.metadata.ownership_method === "string"
      ? provider.metadata.ownership_method
      : tool.provider.verified
        ? "generic"
        : null

  const checks = await store.listVerificationChecks(toolId, 50)
  const usage = await store.usageStats(toolId)
  const profile = computeTrustProfile({
    providerVerified: tool.provider.verified,
    ownershipMethod,
    checks,
    usage,
  })
  await store.upsertTrustProfile(toolId, profile)
  return profile
}
