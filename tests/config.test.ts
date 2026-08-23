import { describe, expect, it } from "vitest"
import { loadConfig } from "../src/config.js"

describe("security configuration", () => {
  it("uses a narrow browser egress policy and bounded tool quota", () => {
    const config = loadConfig({})

    expect(config.BROWSER_EGRESS_ALLOWED_PORTS).toEqual([80, 443])
    expect(config.TOOL_RATE_LIMIT_MAX).toBe(20)
  })

  it("rejects invalid browser egress ports", () => {
    expect(() =>
      loadConfig({ BROWSER_EGRESS_ALLOWED_PORTS: "80,70000" })
    ).toThrow(/comma-separated TCP ports/)
  })

  it("accepts a single-line OpenAI Apps domain challenge token", () => {
    expect(
      loadConfig({ OPENAI_APPS_CHALLENGE_TOKEN: "openai-domain-token" })
        .OPENAI_APPS_CHALLENGE_TOKEN
    ).toBe("openai-domain-token")
    expect(() =>
      loadConfig({ OPENAI_APPS_CHALLENGE_TOKEN: "bad\ntoken" })
    ).toThrow(/single line/)
  })
})
