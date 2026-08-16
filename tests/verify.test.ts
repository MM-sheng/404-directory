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
    expect(result.evidence).toEqual([
      {
        check: "reachable",
        expected: true,
        observed: true,
        passed: true,
      },
      {
        check: "status",
        expected: 200,
        observed: 200,
        passed: true,
      },
      {
        check: "https",
        expected: true,
        observed: true,
        passed: true,
      },
      {
        check: "text",
        expected: "Example Domain",
        observed: true,
        passed: true,
      },
    ])
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
    expect(result.evidence).toHaveLength(3)
  })
})
