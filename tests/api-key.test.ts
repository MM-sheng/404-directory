import { describe, expect, it } from "vitest"
import { ApiKeyAuthenticator } from "../src/security/api-key.js"

const key = "test-key-with-at-least-24-characters"

describe("ApiKeyAuthenticator", () => {
  it("accepts X-API-Key and Bearer without exposing the raw key", () => {
    const auth = new ApiKeyAuthenticator([key])

    const headerId = auth.keyId({ "x-api-key": key })
    const bearerId = auth.keyId({ authorization: `Bearer ${key}` })

    expect(headerId).toBeTruthy()
    expect(bearerId).toBe(headerId)
    expect(headerId).not.toContain(key)
  })

  it("rejects invalid credentials and uses an IP rate-limit identity", () => {
    const auth = new ApiKeyAuthenticator([key])

    expect(auth.keyId({ "x-api-key": "wrong" })).toBeUndefined()
    expect(auth.rateLimitKey({}, "203.0.113.10")).toMatch(/^ip:[a-f0-9]{16}$/)
  })
})
