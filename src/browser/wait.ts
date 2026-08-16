import type { Page } from "playwright"

export type WaitResult = {
  network_idle: boolean
  content_stable: boolean
  waited_ms: number
}

async function fingerprint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const text = (document.body?.innerText ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4_000)
    const interactive = document.querySelectorAll(
      "button, a[href], input, select, textarea, [role=button]"
    ).length
    const jsonLd = document.querySelectorAll(
      'script[type="application/ld+json"]'
    ).length
    return `${document.title}|${interactive}|${jsonLd}|${text.length}|${text}`
  })
}

/**
 * After DOMContentLoaded, wait briefly for SPA network quiet and content
 * fingerprint stability. Never exceeds the remaining budget.
 */
export async function waitForPageStability(
  page: Page,
  {
    networkIdleMs,
    stabilityPollMs,
    maxWaitMs,
  }: {
    networkIdleMs: number
    stabilityPollMs: number
    maxWaitMs: number
  }
): Promise<WaitResult> {
  const started = Date.now()
  let networkIdle = false
  let contentStable = false

  const remaining = () => Math.max(0, maxWaitMs - (Date.now() - started))

  if (remaining() > 0) {
    try {
      await page.waitForLoadState("networkidle", {
        timeout: Math.min(networkIdleMs, remaining()),
      })
      networkIdle = true
    } catch {
      // Many long-polling sites never reach networkidle; continue.
    }
  }

  if (remaining() > stabilityPollMs * 2) {
    let previous = await fingerprint(page)
    let stableRounds = 0
    const requiredRounds = 2

    while (remaining() > stabilityPollMs && stableRounds < requiredRounds) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(stabilityPollMs, remaining()))
      )
      const next = await fingerprint(page)
      if (next === previous) {
        stableRounds += 1
      } else {
        stableRounds = 0
        previous = next
      }
    }
    contentStable = stableRounds >= requiredRounds
  }

  return {
    network_idle: networkIdle,
    content_stable: contentStable,
    waited_ms: Date.now() - started,
  }
}
