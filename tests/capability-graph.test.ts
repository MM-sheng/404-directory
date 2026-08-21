import { describe, expect, it } from "vitest"
import {
  buildCapabilityGraph,
  capabilitySimilarity,
  recommendRelatedTools,
} from "../src/domain/capability-graph.js"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import {
  createOwnershipChallenge,
  verifyOwnershipChallenge,
} from "../src/domain/ownership.js"
import { computeTrustProfile } from "../src/domain/trust.js"

describe("capability graph", () => {
  it("scores shared capabilities with Jaccard + affinity boost", () => {
    const { similarity, shared } = capabilitySimilarity(
      {
        capabilities: ["btc", "market-analysis"],
        protocol: "mcp",
        category: "finance",
      },
      {
        capabilities: ["btc", "news"],
        protocol: "mcp",
        category: "finance",
      }
    )
    expect(shared).toEqual(["btc"])
    expect(similarity).toBeGreaterThan(0.3)
  })

  it("builds edges and recommends related tools", async () => {
    const store = new MemoryCatalogStore()
    await store.registerTool({
      name: "btc_analyzer",
      description: "Analyze BTC market signals for agents",
      capabilities: ["btc", "market-analysis"],
      protocol: "mcp",
      endpoint: "https://example.com/mcp-a",
      category: "finance",
      version: "1.0.0",
      authentication: "none",
      provider: {
        name: "A",
        slug: "prov-a",
        identity: { type: "domain", value: "a.example" },
      },
    })
    const a = await store.getToolBySlug("btc_analyzer")
    await store.setToolStatus(a!.id, "active")

    await store.registerTool({
      name: "btc_news",
      description: "BTC news summarizer for agents",
      capabilities: ["btc", "news"],
      protocol: "mcp",
      endpoint: "https://example.com/mcp-b",
      category: "finance",
      version: "1.0.0",
      authentication: "none",
      provider: {
        name: "B",
        slug: "prov-b",
        identity: { type: "domain", value: "b.example" },
      },
    })
    const b = await store.getToolBySlug("btc_news")
    await store.setToolStatus(b!.id, "active")

    await store.registerTool({
      name: "image_resize",
      description: "Resize images for agents",
      capabilities: ["image", "resize"],
      protocol: "api",
      endpoint: "https://example.com/img",
      category: "media",
      version: "1.0.0",
      authentication: "none",
      provider: {
        name: "C",
        slug: "prov-c",
        identity: { type: "domain", value: "c.example" },
      },
    })
    const c = await store.getToolBySlug("image_resize")
    await store.setToolStatus(c!.id, "active")

    const graph = await buildCapabilityGraph(store)
    expect(graph.algorithm_version).toBe("cap_v1")
    expect(graph.nodes).toHaveLength(3)
    expect(
      graph.edges.some(
        (edge) =>
          edge.shared_capabilities.includes("btc") &&
          edge.source_slug.includes("btc")
      )
    ).toBe(true)
    expect(graph.capabilities.some((c) => c.capability === "btc")).toBe(true)

    const related = await recommendRelatedTools(store, "btc_analyzer", 5)
    expect(related[0]?.tool.slug).toBe("btc_news")
    expect(related[0]?.shared_capabilities).toContain("btc")
    expect(related[0]?.similarity).toBeGreaterThan(0)
  })
})

describe("github ownership", () => {
  it("verifies provider ownership via GitHub bio challenge", async () => {
    const store = new MemoryCatalogStore()
    await store.registerTool({
      name: "gh_tool",
      description: "Tool owned by a GitHub identity for testing",
      capabilities: ["demo"],
      protocol: "api",
      endpoint: "https://example.com/api",
      version: "1.0.0",
      authentication: "none",
      provider: {
        name: "Octo",
        slug: "octo",
        identity: { type: "github", value: "octocat" },
      },
    })

    const challenge = await createOwnershipChallenge(store, "octo")
    expect(challenge.method).toBe("github_bio")
    if (challenge.method !== "github_bio") throw new Error("expected github")

    const fail = await verifyOwnershipChallenge(store, "octo", {
      fetchGithubBio: async () => "no token here",
    })
    expect(fail.verified).toBe(false)

    const ok = await verifyOwnershipChallenge(store, "octo", {
      fetchGithubBio: async () =>
        `hello 404-directory-verify=${challenge.token} world`,
    })
    expect(ok.verified).toBe(true)

    const provider = await store.getProviderBySlug("octo")
    expect(provider?.verified).toBe(true)
    expect(provider?.metadata.ownership_method).toBe("github_bio")

    const profile = computeTrustProfile({
      providerVerified: true,
      ownershipMethod: "github_bio",
      checks: [],
      usage: { invocations: 0, successes: 0 },
    })
    expect(profile.ownership_score).toBe(0.9)
  })
})
