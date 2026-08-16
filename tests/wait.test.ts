import { describe, expect, it, vi } from "vitest"
import type { Page } from "playwright"
import { waitForPageStability } from "../src/browser/wait.js"

function createFakePage(fingerprints: string[]): Page {
  let index = 0
  return {
    evaluate: vi.fn(async () => {
      const value = fingerprints[Math.min(index, fingerprints.length - 1)]
      index += 1
      return value
    }),
    waitForLoadState: vi.fn(async () => undefined),
  } as unknown as Page
}

describe("waitForPageStability", () => {
  it("reports network idle and content stability", async () => {
    const page = createFakePage(["a", "a", "a"])
    const result = await waitForPageStability(page, {
      networkIdleMs: 200,
      stabilityPollMs: 20,
      maxWaitMs: 500,
    })

    expect(result.network_idle).toBe(true)
    expect(result.content_stable).toBe(true)
    expect(result.waited_ms).toBeGreaterThanOrEqual(0)
  })
})
