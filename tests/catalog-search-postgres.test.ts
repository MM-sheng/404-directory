import { describe, expect, it } from "vitest"
import { openDatabase } from "../src/db/client.js"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import { PostgresCatalogStore } from "../src/domain/postgres-store.js"
import type { ToolSearchQuery } from "../src/domain/types.js"
import { seedCuratedMcpServers } from "../src/domain/seed-curated-mcp.js"
import {
  seedLateRankingCandidate,
  seedSearchCorpus,
} from "./fixtures/search-corpus.js"

describe("PostgreSQL catalog recall parity", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "matches memory for text, aliases, filters, stable ordering and late-ranked candidates",
    async () => {
      const handle = openDatabase(process.env.DATABASE_URL)!
      const postgres = new PostgresCatalogStore(handle.db)
      const memory = new MemoryCatalogStore()
      try {
        for (const store of [memory, postgres]) {
          const created = await seedSearchCorpus(store)
          await store.recordInvocation({
            tool_id: created[1].id,
            tool_name: created[1].name,
            version: "1",
            source: "test",
            success: true,
            latency_ms: 1,
          })
          await seedLateRankingCandidate(store)
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
        }
        const base: ToolSearchQuery = {
          status: "active",
          limit: 50,
          category: "search-regression",
          protocol: "mcp",
        }
        const cases: ToolSearchQuery[] = [
          base,
          ...[
            "official documentation",
            "find official docs",
            "CAPABILITY ONLY TOKEN",
            "Northwind Labs",
            "alpha_docs",
            "%_",
            "'; DROP TABLE tools; --",
            "official docs unknownintent",
            " ＡＬＰＨＡ　ＤＯＣＳ ",
            "docum",
          ].map((q) => ({ ...base, q })),
          { ...base, q: "official docs", limit: 1 },
          { ...base, capability: "DOCUMENTATION-search" },
          { ...base, capability: "%" },
          { ...base, capability: "documentation_search" },
          { ...base, capability: "documentation-search", protocol: "api" },
          { ...base, capability: "documentation-search", trust_threshold: 0.5 },
          { ...base, capability: "documentation-search", status: "pending" },
          { ...base, capability: "documentation-search", status: "all" },
          { ...base, capability: "documentation-search", status: "suspended" },
          {
            ...base,
            category: "late-ranking-regression",
            q: "ranking_probe",
            limit: 1,
          },
          {
            ...base,
            category: "late-ranking-regression",
            trust_threshold: 0.8,
            limit: 1,
          },
          { ...base, category: "developer-tools", q: "official documentation" },
          {
            ...base,
            category: "developer-tools",
            q: "Find official docs for OpenAI",
            limit: 1,
          },
        ]
        for (const query of cases) {
          const expected = (await memory.searchTools(query)).map(
            (tool) => tool.slug
          )
          const actual = (await postgres.searchTools(query)).map(
            (tool) => tool.slug
          )
          expect(actual, JSON.stringify(query)).toEqual(expected)
        }
        expect(
          (
            await postgres.searchTools({
              ...base,
              category: "late-ranking-regression",
              q: "ranking_probe",
              limit: 1,
            })
          )[0]?.slug
        ).toBe("ranking_probe")
        expect(
          (
            await postgres.searchTools({
              ...base,
              category: "late-ranking-regression",
              trust_threshold: 0.8,
              limit: 1,
            })
          )[0]?.slug
        ).toBe("ranking_probe")
        const official = await postgres.searchTools({
          status: "active",
          q: "official documentation",
          limit: 50,
        })
        expect(official.map((tool) => tool.slug)).toEqual(
          expect.arrayContaining([
            "openai_docs_mcp",
            "microsoft_learn_mcp",
            "aws_knowledge_mcp",
            "cloudflare_docs_mcp",
          ])
        )
      } finally {
        await handle.close()
      }
    },
    30_000
  )
})
