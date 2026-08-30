import { describe, expect, it } from "vitest"
import { buildApp } from "../src/http/app.js"
import { loadConfig } from "../src/config.js"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import { ToolRegistry } from "../src/tools/registry.js"
import { hashApiKey } from "../src/domain/auth.js"
import { verifiedAgentAdmissionDigests } from "../src/domain/verified-agent-evidence.js"

const adminToken = "verified-agent-admin-token-only"
const salt = "verified-agent-evidence-test-salt"
const first = {
  agent_id: "agent:11111111-1111-4111-8111-111111111111@pilot",
  operator_id: "operator:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  source: "prediction-market-pilot",
  verification_method: "pilot_interview" as const,
  evidence_ref: "https://example.com/public-proof/first",
}
const second = {
  agent_id: "agent:22222222-2222-4222-8222-222222222222@pilot",
  operator_id: first.operator_id,
  source: first.source,
  verification_method: "partner_attested" as const,
  evidence_ref: "https://example.com/public-proof/second",
}

function success(agentKey: string, overrides: Record<string, unknown> = {}) {
  return {
    tool_name: "evaluate_prediction_market",
    source: "mcp",
    success: true,
    latency_ms: 12,
    agent_key: agentKey,
    agent_identity_kind: "explicit" as const,
    client_name: "independent-pilot",
    attribution_source: "prediction-market-pilot",
    is_external: true,
    ...overrides,
  }
}

describe("verified independent Agent evidence", () => {
  it("counts only admitted identities with successful external execution and de-duplicates operators", async () => {
    const store = new MemoryCatalogStore()
    const firstDigests = verifiedAgentAdmissionDigests(first, salt)
    const secondDigests = verifiedAgentAdmissionDigests(second, salt)

    const admittedFirst = await store.upsertVerifiedAgentAdmission({
      ...firstDigests,
      source: first.source,
      verification_method: first.verification_method,
    })
    expect(admittedFirst.created).toBe(true)
    expect(await store.verifiedAgentEvidenceSummary()).toMatchObject({
      active_admissions: 1,
      verified_external_agents: 0,
      verified_operators: 0,
      successful_external_invocations: 0,
    })

    await store.recordInvocation(
      success(firstDigests.agent_key, { success: false })
    )
    await store.recordInvocation(
      success(firstDigests.agent_key, { is_external: false })
    )
    await store.recordInvocation(
      success(firstDigests.agent_key, { agent_identity_kind: "internal" })
    )
    await store.recordInvocation(success("a1_not-admitted-but-valid-digest"))
    expect(
      (await store.verifiedAgentEvidenceSummary()).verified_external_agents
    ).toBe(0)

    await store.recordInvocation(success(firstDigests.agent_key))
    await store.upsertVerifiedAgentAdmission({
      ...secondDigests,
      source: second.source,
      verification_method: second.verification_method,
    })
    await store.recordInvocation(success(secondDigests.agent_key))
    const qualified = await store.verifiedAgentEvidenceSummary()
    expect(qualified).toMatchObject({
      active_admissions: 2,
      verified_external_agents: 2,
      verified_operators: 1,
      successful_external_invocations: 2,
      progress_ratio: 0.002,
      sources: [
        {
          source: first.source,
          verified_agents: 2,
          verified_operators: 1,
          successful_invocations: 2,
        },
      ],
    })

    const duplicate = await store.upsertVerifiedAgentAdmission({
      ...firstDigests,
      source: first.source,
      verification_method: "maintainer_confirmed",
    })
    expect(duplicate.created).toBe(false)
    expect((await store.verifiedAgentEvidenceSummary()).active_admissions).toBe(
      2
    )

    expect(
      await store.revokeVerifiedAgentAdmission(admittedFirst.admission.id)
    ).toBe(true)
    expect(await store.verifiedAgentEvidenceSummary()).toMatchObject({
      active_admissions: 1,
      verified_external_agents: 1,
      verified_operators: 1,
      successful_external_invocations: 1,
    })
  })

  it("keeps admission admin-only and never returns raw identity or evidence", async () => {
    const store = new MemoryCatalogStore()
    const providerToken = "provider-token-forbidden-admin"
    await store.ensureTool(
      {
        name: "provider_auth_fixture",
        description: "Provider authentication fixture",
        capabilities: ["fixture"],
        protocol: "api",
        endpoint: "https://example.com/tool",
        version: "1.0.0",
        authentication: "none",
        provider: {
          name: "Provider Auth Fixture",
          slug: "provider-auth-fixture",
          identity: { type: "domain", value: "example.com" },
        },
      },
      { status: "active" }
    )
    await store.setProviderMetadata("provider-auth-fixture", {
      api_key_hash: hashApiKey(providerToken),
    })
    const app = await buildApp(
      new ToolRegistry(),
      loadConfig({
        REGISTRY_ADMIN_TOKEN: adminToken,
        AGENT_ANALYTICS_SALT: salt,
        SEED_FIRST_PARTY_TOOLS: "false",
        SEED_CURATED_MCP_SERVERS: "false",
        MCP_GATEWAY_ENABLED: "false",
      }),
      store
    )
    try {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/pilot/verified-agents",
            payload: first,
          })
        ).statusCode
      ).toBe(401)
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/pilot/verified-agents",
            headers: { authorization: `Bearer ${providerToken}` },
            payload: first,
          })
        ).statusCode
      ).toBe(403)

      const admitted = await app.inject({
        method: "POST",
        url: "/v1/pilot/verified-agents",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: first,
      })
      expect(admitted.statusCode).toBe(201)
      expect(admitted.json()).toMatchObject({
        created: true,
        counts_toward_target: false,
        admission: {
          agent_key: expect.stringMatching(/^a1_[a-f0-9]{40}$/),
          operator_key: expect.stringMatching(/^o1_[a-f0-9]{40}$/),
          evidence_ref_hash: expect.stringMatching(/^e1_[a-f0-9]{40}$/),
        },
      })
      expect(admitted.body).not.toContain(first.agent_id)
      expect(admitted.body).not.toContain(first.operator_id)
      expect(admitted.body).not.toContain(first.evidence_ref)

      const diagnostic = await app.inject({
        method: "GET",
        url: "/v1/metrics/agents",
      })
      expect(diagnostic.json()).toMatchObject({
        metric:
          "unverified_agent_installation_ids_with_successful_tool_execution",
      })
      const verified = await app.inject({
        method: "GET",
        url: "/v1/metrics/verified-agents",
      })
      expect(verified.json()).toMatchObject({
        metric:
          "verified_independent_external_agents_with_successful_execution",
        active_admissions: 1,
        verified_external_agents: 0,
      })
    } finally {
      await app.close()
    }
  })
})
