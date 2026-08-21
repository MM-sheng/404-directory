import { describe, expect, it } from "vitest"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import { PostgresCatalogStore } from "../src/domain/postgres-store.js"
import { openDatabase } from "../src/db/client.js"

/**
 * Real Postgres integration — skipped unless DATABASE_URL is set.
 * Catches ensureTool version uniqueness / isLatest races that memory misses.
 */
describe("postgres ensureTool idempotency", () => {
  const url = process.env.DATABASE_URL

  it.skipIf(!url)("re-seeding the same version does not throw", async () => {
    const handle = openDatabase(url)
    expect(handle).not.toBeNull()
    const store = new PostgresCatalogStore(handle!.db)

    const input = {
      name: `idempotent_tool_${Date.now()}`,
      description: "Idempotent seed regression fixture for postgres",
      capabilities: ["idempotency"],
      protocol: "api" as const,
      endpoint: "https://example.com/idempotent",
      version: "1.0.0",
      authentication: "none" as const,
      provider: {
        name: "Idempotent Provider",
        slug: `idempotent-prov-${Date.now()}`,
        identity: { type: "domain" as const, value: "example.com" },
      },
    }

    const first = await store.ensureTool(input, {
      status: "active",
      providerVerified: true,
    })
    const second = await store.ensureTool(input, {
      status: "active",
      providerVerified: true,
    })

    expect(second.id).toBe(first.id)
    expect(second.version).toBe("1.0.0")
    await handle!.close()
  })

  it("memory ensureTool remains idempotent for same version", async () => {
    const store = new MemoryCatalogStore()
    const input = {
      name: "mem_idempotent",
      description: "Memory idempotent seed fixture tool",
      capabilities: ["idempotency"],
      protocol: "api" as const,
      endpoint: "https://example.com/mem",
      version: "1.0.0",
      authentication: "none" as const,
      provider: {
        name: "Mem",
        slug: "mem-prov",
        identity: { type: "domain" as const, value: "example.com" },
      },
    }
    const first = await store.ensureTool(input, { status: "active" })
    const second = await store.ensureTool(input, { status: "active" })
    expect(second.id).toBe(first.id)
  })
})
