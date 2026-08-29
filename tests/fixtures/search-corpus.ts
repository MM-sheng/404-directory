import type { CatalogStore, ToolStatus } from "../../src/domain/store.js"
import { computeTrustProfile } from "../../src/domain/trust.js"

export async function seedSearchCorpus(
  store: CatalogStore,
  category = "search-regression",
  reverseOrder = false
) {
  const specs: Array<{
    name: string
    description: string
    capabilities: string[]
    status?: ToolStatus
    protocol?: "mcp" | "api"
    otherCategory?: boolean
    provider?: string
    trust?: number
  }> = [
    {
      name: "alpha_docs",
      description: "Official Acme developer documentation source",
      capabilities: ["documentation-search"],
      trust: 0.4,
    },
    {
      name: "beta_docs",
      description: "Official Acme developer documentation source",
      capabilities: ["documentation-search"],
      trust: 0.4,
    },
    {
      name: "opaque_reference",
      description: "A public reference index",
      capabilities: ["documentation-search", "capability-only-token"],
      provider: "Northwind Labs",
      trust: 0.4,
    },
    {
      name: "degraded_docs",
      description: "Official Acme developer documentation source",
      capabilities: ["documentation-search"],
      status: "degraded",
      trust: 0.4,
    },
    {
      name: "pending_docs",
      description: "Official Acme developer documentation source",
      capabilities: ["documentation-search"],
      status: "pending",
      trust: 1,
    },
    {
      name: "deprecated_docs",
      description: "Official Acme developer documentation source",
      capabilities: ["documentation-search"],
      status: "deprecated",
      trust: 1,
    },
    {
      name: "suspended_docs",
      description: "Official Acme developer documentation source",
      capabilities: ["documentation-search"],
      status: "suspended",
      trust: 1,
    },
    {
      name: "api_docs",
      description: "Official Acme developer documentation source",
      capabilities: ["documentation-search"],
      protocol: "api",
      trust: 1,
    },
    {
      name: "other_category_docs",
      description: "Official Acme developer documentation source",
      capabilities: ["documentation-search"],
      otherCategory: true,
      trust: 1,
    },
  ]
  const created = []
  for (const spec of reverseOrder ? specs.reverse() : specs) {
    const tool = await store.ensureTool(
      {
        name: spec.name,
        description: spec.description,
        capabilities: spec.capabilities,
        protocol: spec.protocol ?? "mcp",
        category: spec.otherCategory ? `${category}-other` : category,
        endpoint: "https://example.com/mcp",
        version: "1",
        authentication: "none",
        provider: {
          name: spec.provider ?? "Acme",
          slug: (spec.provider ?? "acme").toLowerCase().replaceAll(" ", "-"),
          identity: { type: "domain", value: "example.com" },
        },
      },
      { status: spec.status ?? "active", providerVerified: true }
    )
    const profile = computeTrustProfile({
      providerVerified: true,
      checks: [],
      usage: { invocations: 0, successes: 0 },
    })
    await store.upsertTrustProfile(tool.id, {
      ...profile,
      overall_score: spec.trust ?? 0.4,
    })
    created.push(tool)
  }
  return created
}

export async function seedLateRankingCandidate(store: CatalogStore) {
  // More than the old PostgreSQL 100-row pre-ranking cap; keep the best last.
  for (let index = 0; index < 106; index++) {
    const name =
      index === 105
        ? "ranking_probe"
        : `ranking_decoy_${String(index).padStart(3, "0")}`
    const tool = await store.ensureTool(
      {
        name,
        description: "Public ranking probe reference entries",
        capabilities: ["ranking-test"],
        category: "late-ranking-regression",
        protocol: "mcp",
        endpoint: "https://example.com/mcp",
        version: "1",
        authentication: "none",
        provider: {
          name: "Ranking fixture",
          slug: "ranking-fixture",
          identity: { type: "domain", value: "example.com" },
        },
      },
      { status: "active", providerVerified: true }
    )
    const profile = computeTrustProfile({
      providerVerified: true,
      checks: [],
      usage: { invocations: 0, successes: 0 },
    })
    await store.upsertTrustProfile(tool.id, {
      ...profile,
      overall_score: index === 105 ? 0.9 : 0.2,
    })
  }
}
