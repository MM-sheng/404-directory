import { createHash } from "node:crypto"
import { mkdtemp, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import {
  Directory404Client,
  loadOrCreateAgentId,
  type PredictionMarketDecision,
} from "../packages/404-directory-risk-sdk/src/index.js"

function fakeFetch(decision: PredictionMarketDecision) {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const fetchImpl = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init })
      if (String(url).endsWith("/outcome")) {
        return Response.json({
          receipt_id: "00000000-0000-4000-8000-000000000001",
          status: "recorded",
          evidence_level: "self_reported",
        })
      }
      return Response.json(
        {
          receipt_id: "00000000-0000-4000-8000-000000000001",
          outcome_token: "x".repeat(43),
          platform: "polymarket",
          policy_version: "polymarket-preflight-v1",
          decision,
          risk_score: decision === "allow" ? 0 : 60,
          confidence: 0.9,
          reason_codes: [],
          risk_factors: [],
          unknowns: [],
          next_action: "test",
        },
        { status: 201 }
      )
    }
  ) as unknown as typeof fetch
  return { fetchImpl, requests }
}

const request = {
  market: "example-market",
  intended_action: "buy_yes" as const,
  estimated_notional_usd: 100,
  geographic_eligibility: "eligible" as const,
}

describe("404.directory TypeScript risk SDK", () => {
  it("persists a stable privacy-safe identity per Agent name", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "404-sdk-test-"))
    const first = await loadOrCreateAgentId("strategy-a", directory)
    const second = await loadOrCreateAgentId("strategy-a", directory)
    const other = await loadOrCreateAgentId("strategy-b", directory)

    expect(first).toMatch(/^agent:[0-9a-f-]{36}$/)
    expect(second).toBe(first)
    expect(other).not.toBe(first)
    const agentKey = createHash("sha256")
      .update("strategy-a")
      .digest("hex")
      .slice(0, 24)
    const files = await readFile(
      path.join(directory, "risk-sdk", agentKey, "agent-id"),
      "utf8"
    )
    expect(files.trim()).toBe(first)
  })

  it("runs a blocked action in shadow mode and reports the outcome", async () => {
    const { fetchImpl, requests } = fakeFetch("block")
    const client = await Directory404Client.create({
      source: "pilot-a",
      agentId: "agent:00000000-0000-4000-8000-000000000001",
      fetchImpl,
    })
    const execute = vi.fn(async () => "order-result")
    const result = await client.guardPredictionMarketAction(request, execute, {
      mode: "shadow",
    })

    expect(result).toMatchObject({
      executed: true,
      blocked_by_policy: false,
      result: "order-result",
      report: { status: "recorded" },
    })
    expect(execute).toHaveBeenCalledOnce()
    expect(requests).toHaveLength(2)
    expect(requests[0]?.init?.headers).toMatchObject({
      "x-404-agent-id": "agent:00000000-0000-4000-8000-000000000001",
      "x-404-source": "pilot-a",
      "x-404-client-name": "agent-risk-sdk-ts",
    })
  })

  it("stops block in warn mode and review in enforce mode", async () => {
    const blockedTransport = fakeFetch("block")
    const blockedClient = await Directory404Client.create({
      source: "pilot-b",
      agentId: "agent:00000000-0000-4000-8000-000000000002",
      fetchImpl: blockedTransport.fetchImpl,
    })
    const blockedExecute = vi.fn()
    const blocked = await blockedClient.guardPredictionMarketAction(
      request,
      blockedExecute,
      { mode: "warn" }
    )
    expect(blocked).toMatchObject({
      executed: false,
      blocked_by_policy: true,
      report: { status: "recorded" },
    })
    expect(blockedExecute).not.toHaveBeenCalled()

    const reviewTransport = fakeFetch("review")
    const reviewClient = await Directory404Client.create({
      source: "pilot-c",
      agentId: "agent:00000000-0000-4000-8000-000000000003",
      fetchImpl: reviewTransport.fetchImpl,
    })
    const reviewExecute = vi.fn()
    const reviewed = await reviewClient.guardPredictionMarketAction(
      request,
      reviewExecute,
      { mode: "enforce", onReview: () => true }
    )
    expect(reviewed.executed).toBe(false)
    expect(reviewExecute).not.toHaveBeenCalled()
  })

  it("requires explicit approval for review in warn mode", async () => {
    const { fetchImpl } = fakeFetch("review")
    const client = await Directory404Client.create({
      source: "pilot-d",
      agentId: "agent:00000000-0000-4000-8000-000000000004",
      fetchImpl,
    })
    const execute = vi.fn(async () => "approved")
    const result = await client.guardPredictionMarketAction(request, execute, {
      mode: "warn",
      onReview: async () => true,
    })
    expect(result).toMatchObject({ executed: true, result: "approved" })
  })

  it("fails closed outside shadow mode when preflight is unavailable", async () => {
    const unavailable = vi.fn(async () => {
      throw new Error("network unavailable")
    }) as unknown as typeof fetch
    const client = await Directory404Client.create({
      source: "pilot-e",
      agentId: "agent:00000000-0000-4000-8000-000000000005",
      fetchImpl: unavailable,
    })
    const execute = vi.fn()
    const result = await client.guardPredictionMarketAction(request, execute, {
      mode: "enforce",
    })
    expect(result).toMatchObject({
      executed: false,
      blocked_by_policy: true,
      preflight_error: { code: "request_failed" },
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it("treats a successful but malformed preflight response as unavailable", async () => {
    const malformed = vi.fn(async () =>
      Response.json({ decision: "allow" })
    ) as unknown as typeof fetch
    const client = await Directory404Client.create({
      source: "pilot-f",
      agentId: "agent:00000000-0000-4000-8000-000000000006",
      fetchImpl: malformed,
    })
    const execute = vi.fn()
    const result = await client.guardPredictionMarketAction(request, execute, {
      mode: "enforce",
    })

    expect(result).toMatchObject({
      executed: false,
      blocked_by_policy: true,
      preflight_error: { code: "invalid_response" },
    })
    expect(execute).not.toHaveBeenCalled()
  })
})
