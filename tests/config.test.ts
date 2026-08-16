import { describe, expect, it } from "vitest"
import { loadConfig } from "../src/config.js"

describe("security configuration", () => {
  it("uses a narrow browser egress policy and open auth by default", () => {
    const config = loadConfig({})

    expect(config.BROWSER_EGRESS_ALLOWED_PORTS).toEqual([80, 443])
    expect(config.API_KEYS).toEqual([])
    expect(config.TOOL_RATE_LIMIT_MAX).toBe(20)
  })

  it("rejects weak API keys", () => {
    expect(() => loadConfig({ API_KEYS: "too-short" })).toThrow(
      /at least 24 characters/
    )
  })

  it("rejects invalid browser egress ports", () => {
    expect(() =>
      loadConfig({ BROWSER_EGRESS_ALLOWED_PORTS: "80,70000" })
    ).toThrow(/comma-separated TCP ports/)
  })
})
