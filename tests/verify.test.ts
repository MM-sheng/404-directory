import { describe, expect, it } from "vitest"
import { verifyWeb } from "../src/verify/verify.js"
import { VerifyWebResultSchema } from "../src/verify/schemas.js"

describe("verifyWeb SSRF", () => {
  it("refuses loopback targets", async () => {
    const result = await verifyWeb(
      { url: "http://127.0.0.1/", expected_status: 200 },
      { timeoutMs: 1_000, maxBodyBytes: 1_024, maxRedirects: 2 }
    )
    expect(result.verified).toBe(false)
    expect(result.checks.reachable).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe("verifyWeb fetch behavior", () => {
  it("verifies a matching HTTPS response", async () => {
    const result = await verifyWeb(
      {
        url: "https://example.com",
        expected_status: 200,
        expected_text: "Example Domain",
      },
      {
        timeoutMs: 2_000,
        maxBodyBytes: 1_024,
        maxRedirects: 3,
        resolveUrl: async (input) => ({
          url: new URL(input),
          addresses: [{ address: "93.184.216.34", family: 4 }],
        }),
        requestUrl: async () => ({
          status: 200,
          body: "Hello Example Domain",
        }),
      }
    )

    expect(result.verified).toBe(true)
    expect(result.checks).toEqual({
      reachable: true,
      status: 200,
      https_valid: true,
      text_found: true,
    })
    expect(result.evidence).toMatchObject({
      requested_url: "https://example.com",
      final_url: "https://example.com/",
      http: { status: 200, expected_status: 200, matched: true },
      expected_text: {
        value: "Example Domain",
        checked: true,
        matched: true,
      },
      tls: { requested: true, valid: true },
      redirects: { count: 0, chain: [] },
      claims: expect.arrayContaining([
        {
          claim: "status_matches",
          passed: true,
          evidence_paths: ["http.status", "http.expected_status"],
        },
      ]),
    })
    expect(() => VerifyWebResultSchema.parse(result)).not.toThrow()
  })

  it("rejects oversized response bodies", async () => {
    const result = await verifyWeb(
      { url: "https://example.com", expected_status: 200 },
      {
        timeoutMs: 2_000,
        maxBodyBytes: 1_024,
        maxRedirects: 3,
        resolveUrl: async (input) => ({
          url: new URL(input),
          addresses: [{ address: "93.184.216.34", family: 4 }],
        }),
        requestUrl: async () => {
          throw new Error("Response body exceeded 1024 bytes")
        },
      }
    )

    expect(result.verified).toBe(false)
    expect(result.error).toMatch(/exceeded/i)
    expect(result.evidence.claims).toHaveLength(3)
    expect(result.evidence.final_url).toBeNull()
  })

  it("records every redirect as evidence", async () => {
    const responses = [
      { status: 302, location: "/final", body: "" },
      { status: 200, body: "ready" },
    ]
    const result = await verifyWeb(
      {
        url: "https://example.com/start",
        expected_status: 200,
        expected_text: "ready",
      },
      {
        timeoutMs: 2_000,
        maxBodyBytes: 1_024,
        maxRedirects: 3,
        resolveUrl: async (input) => ({
          url: new URL(input),
          addresses: [{ address: "93.184.216.34", family: 4 }],
        }),
        requestUrl: async () => responses.shift()!,
      }
    )

    expect(result.verified).toBe(true)
    expect(result.evidence.redirects).toEqual({
      count: 1,
      chain: [
        {
          status: 302,
          from: "https://example.com/start",
          to: "https://example.com/final",
        },
      ],
    })
  })
})
