import { describe, expect, it } from "vitest"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import {
  createOwnershipChallenge,
  verifyOwnershipChallenge,
} from "../src/domain/ownership.js"
import { seedFirstPartyTools } from "../src/domain/seed-first-party.js"
import { computeTrustProfile } from "../src/domain/trust.js"
import { ToolRegistry } from "../src/tools/registry.js"
import type { ToolDefinition } from "../src/tools/types.js"
import { loadConfig } from "../src/config.js"
import { z } from "zod"

describe("first-party seeding + ownership", () => {
  it("seeds executable tools into the catalog for discovery search", async () => {
    const store = new MemoryCatalogStore()
    const In = z.object({ url: z.string() }).strict()
    const Out = z.object({ ok: z.boolean() }).strict()
    const def: ToolDefinition = {
      name: "verify_web",
      description:
        "Independently verifies that a public website is reachable over HTTPS",
      use_when: "verify deploys",
      do_not_use_when: "private urls",
      version: "0.3.0",
      endpoint: "/verify/web",
      method: "POST",
      status: "active",
      read_only: true,
      side_effects: [],
      requires_auth: false,
      cost: "free",
      typical_latency_ms: 1000,
      examples: [],
      inputSchema: In,
      outputSchema: Out,
      handler: async () => ({ ok: true }),
    }
    const registry = new ToolRegistry().register(def)
    const { seeded } = await seedFirstPartyTools(
      store,
      registry,
      loadConfig({ PUBLIC_BASE_URL: "https://404.directory" })
    )

    expect(seeded).toContain("verify_web")
    expect(seeded).toContain("404_mcp")

    const found = await store.searchTools({
      capability: "web-verification",
      limit: 10,
    })
    expect(found.some((t) => t.slug === "verify_web")).toBe(true)
    expect(found[0]?.provider.verified).toBe(true)
    expect(found[0]?.status).toBe("active")
    expect(found[0]?.trust?.ownership_score).toBe(1)
    expect(found[0]?.metadata.verification).toEqual({
      health_url: "https://404.directory/health",
      expected_method: "GET",
    })
  })

  it("verifies provider ownership via DNS TXT challenge", async () => {
    const store = new MemoryCatalogStore()
    await store.registerTool({
      name: "demo_tool",
      description: "Demo tool for ownership verification testing",
      capabilities: ["demo"],
      protocol: "api",
      endpoint: "https://example.com/api",
      version: "1.0.0",
      authentication: "none",
      provider: {
        name: "Example Labs",
        slug: "example-labs",
        identity: { type: "domain", value: "example.com" },
      },
    })

    const challenge = await createOwnershipChallenge(store, "example-labs")
    expect(challenge.record_name).toBe("_404-directory.example.com")
    expect(challenge.record_value).toContain("404-directory-verify=")

    const fail = await verifyOwnershipChallenge(store, "example-labs", {
      lookupTxt: async () => [["wrong-value"]],
    })
    expect(fail.verified).toBe(false)

    const ok = await verifyOwnershipChallenge(store, "example-labs", {
      lookupTxt: async () => [[challenge.record_value]],
    })
    expect(ok.verified).toBe(true)

    const provider = await store.getProviderBySlug("example-labs")
    expect(provider?.verified).toBe(true)
    expect(provider?.metadata.ownership_method).toBe("dns_txt")

    const profile = computeTrustProfile({
      providerVerified: true,
      ownershipMethod: "dns_txt",
      checks: [],
      usage: { invocations: 0, successes: 0 },
    })
    expect(profile.ownership_score).toBe(0.95)
  })
})
