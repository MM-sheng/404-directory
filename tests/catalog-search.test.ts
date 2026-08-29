import { describe, expect, it } from "vitest"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import { seedCuratedMcpServers } from "../src/domain/seed-curated-mcp.js"
import { searchCatalogTools } from "../src/domain/discovery.js"
import { seedSearchCorpus } from "./fixtures/search-corpus.js"
import { searchTerms } from "../src/domain/catalog-search.js"

describe("first-call catalog recall", () => {
  it("finds separated official documentation keywords in curated descriptions", async () => {
    const store = new MemoryCatalogStore()
    await seedCuratedMcpServers(store)
    for (const slug of [
      "openai_docs_mcp",
      "microsoft_learn_mcp",
      "aws_knowledge_mcp",
      "cloudflare_docs_mcp",
    ]) {
      const tool = await store.getToolBySlug(slug)
      await store.setToolStatus(tool!.id, "active")
    }
    const results = await searchCatalogTools(store, {
      q: "official documentation",
      status: "active",
      limit: 10,
    })
    expect(results.map((tool) => tool.slug)).toEqual(
      expect.arrayContaining([
        "openai_docs_mcp",
        "microsoft_learn_mcp",
        "aws_knowledge_mcp",
        "cloudflare_docs_mcp",
      ])
    )
  })

  it("accepts docs wording and conversational filler without losing the requested provider", async () => {
    const store = new MemoryCatalogStore()
    await seedCuratedMcpServers(store)
    const tool = await store.getToolBySlug("openai_docs_mcp")
    await store.setToolStatus(tool!.id, "active")
    for (const q of [
      "Find official docs for OpenAI",
      "OPENAI documentation search",
      "openai_docs_mcp",
    ]) {
      expect(
        (await searchCatalogTools(store, { q, status: "active", limit: 1 }))[0]
          ?.slug
      ).toBe("openai_docs_mcp")
    }
  })

  it("matches capabilities/providers and keeps every hard filter", async () => {
    const store = new MemoryCatalogStore()
    await seedSearchCorpus(store)
    const base = {
      status: "active" as const,
      limit: 50,
      category: "search-regression",
      protocol: "mcp" as const,
    }
    expect(
      (await store.searchTools({ ...base, q: "capability only token" })).map(
        (t) => t.slug
      )
    ).toEqual(["opaque_reference"])
    expect(
      (await store.searchTools({ ...base, q: "northwind labs" })).map(
        (t) => t.slug
      )
    ).toEqual(["opaque_reference"])
    expect(
      (
        await store.searchTools({
          ...base,
          q: "official docs",
          capability: "DOCUMENTATION-search",
        })
      ).map((t) => t.slug)
    ).toEqual(["alpha_docs", "beta_docs", "degraded_docs"])
    expect(
      await store.searchTools({
        ...base,
        q: "official docs",
        trust_threshold: 0.5,
      })
    ).toEqual([])
    expect(await store.searchTools({ ...base, capability: "%" })).toEqual([])
    expect(
      await store.searchTools({ ...base, capability: "documentation_search" })
    ).toEqual([])
    expect(
      (
        await store.searchTools({
          ...base,
          q: "pending docs",
          status: "pending",
        })
      ).map((t) => t.slug)
    ).toEqual(["pending_docs"])
    expect(
      (await store.searchTools({ ...base, status: "all" })).some(
        (t) => t.slug === "suspended_docs"
      )
    ).toBe(false)
  })

  it("does not turn punctuation, unknown intent or filler-only queries into a full catalog", async () => {
    const store = new MemoryCatalogStore()
    await seedSearchCorpus(store)
    for (const q of [
      "%_",
      "'; DROP TABLE tools; --",
      "official documentation brain surgery",
      "please find me",
    ]) {
      expect(
        await store.searchTools({ q, status: "active", limit: 50 })
      ).toEqual([])
    }
    expect(searchTerms("Find ＯＰＥＮＡＩ docs, please")).toEqual([
      "openai",
      "documentation",
    ])
    expect(
      (await store.searchTools({ q: "   ", status: "active", limit: 1 })).length
    ).toBe(1)
  })

  it("prefers an exact slug and deterministically orders ties independent of insertion order", async () => {
    const store = new MemoryCatalogStore()
    const created = await seedSearchCorpus(store)
    const base = {
      q: "official docs",
      status: "active" as const,
      category: "search-regression",
      protocol: "mcp" as const,
      limit: 3,
    }
    expect((await store.searchTools(base)).map((t) => t.slug)).toEqual([
      "alpha_docs",
      "beta_docs",
      "degraded_docs",
    ])
    const reversed = new MemoryCatalogStore()
    await seedSearchCorpus(reversed, "search-regression", true)
    expect((await reversed.searchTools(base)).map((t) => t.slug)).toEqual([
      "alpha_docs",
      "beta_docs",
      "degraded_docs",
    ])
    await store.recordInvocation({
      tool_id: created[1].id,
      tool_name: created[1].name,
      version: "1",
      source: "test",
      success: true,
      latency_ms: 1,
    })
    expect((await store.searchTools(base))[0].slug).toBe("beta_docs")
    expect(
      (await store.searchTools({ ...base, q: "alpha_docs", limit: 1 }))[0].slug
    ).toBe("alpha_docs")
  })
})
