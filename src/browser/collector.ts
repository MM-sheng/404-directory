import type { BrowserContext, Page, Route } from "playwright"
import type { AppConfig } from "../config.js"
import { assertPublicHttpUrl } from "../security/url.js"
import type { PageSignals } from "../shared/signals.js"
import { BrowserManager } from "./browser-manager.js"
import { waitForPageStability } from "./wait.js"

const SKIPPED_RESOURCE_TYPES = new Set(["image", "media", "font"])

function normalizeText(value: string, limit: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, limit)
}

async function protectRoute(
  route: Route,
  rejectedHosts: Set<string>
): Promise<void> {
  if (SKIPPED_RESOURCE_TYPES.has(route.request().resourceType())) {
    await route.abort("blockedbyclient")
    return
  }

  const requestUrl = route.request().url()
  if (requestUrl.startsWith("data:") || requestUrl.startsWith("blob:")) {
    await route.continue()
    return
  }

  try {
    const parsed = new URL(requestUrl)
    if (rejectedHosts.has(parsed.hostname)) {
      throw new Error("Host previously rejected")
    }
    // Re-resolve every network request instead of caching a positive DNS
    // decision. Browser egress policy remains the production backstop.
    await assertPublicHttpUrl(requestUrl)
    await route.continue()
  } catch {
    try {
      const hostname = new URL(requestUrl).hostname
      rejectedHosts.add(hostname)
    } catch {
      // The request is aborted below.
    }
    await route.abort("blockedbyclient")
  }
}

async function collectFromPage(
  page: Page,
  requestedUrl: string,
  config: AppConfig
): Promise<Omit<PageSignals, "wait">> {
  const collected = await page.evaluate(
    ({ maxTextChars, maxElements }) => {
      const clean = (value: string | null | undefined, limit = 500) =>
        (value ?? "").replace(/\s+/g, " ").trim().slice(0, limit)
      const visible = (element: Element) => {
        const style = window.getComputedStyle(element)
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          element.getClientRects().length > 0
        )
      }
      const labelFor = (element: Element) => {
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement
        ) {
          const explicit = Array.from(element.labels ?? [])
            .map((label) => label.textContent)
            .join(" ")
          return clean(
            explicit ||
              element.getAttribute("aria-label") ||
              element.getAttribute("title") ||
              element.getAttribute("placeholder")
          )
        }
        return clean(
          element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            element.textContent
        )
      }

      const meta = Array.from(document.querySelectorAll("meta"))
        .map((element) => ({
          name: element.getAttribute("name") ?? undefined,
          property: element.getAttribute("property") ?? undefined,
          content: clean(element.getAttribute("content"), 2_000),
        }))
        .filter((item) => item.content)
        .slice(0, 50)

      const semanticDom = Array.from(
        document.querySelectorAll(
          "main, article, nav, header, footer, section, aside, h1, h2, h3, [role]"
        )
      )
        .filter(visible)
        .slice(0, maxElements)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute("role") ?? undefined,
          label: clean(element.getAttribute("aria-label")) || undefined,
          text: clean(element.textContent, 300) || undefined,
        }))

      const controlsFor = (root: ParentNode) =>
        Array.from(root.querySelectorAll("input, select, textarea"))
          .filter(visible)
          .slice(0, maxElements)
          .map((element) => {
            const input = element as HTMLInputElement
            const select = element as HTMLSelectElement
            return {
              kind: element.tagName.toLowerCase() as
                "input" | "select" | "textarea",
              type: input.type || undefined,
              name: input.name || undefined,
              label: labelFor(element) || undefined,
              placeholder: input.placeholder || undefined,
              value:
                input.type === "password"
                  ? undefined
                  : clean(input.value || input.getAttribute("value"), 300) ||
                    undefined,
              options:
                element instanceof HTMLSelectElement
                  ? Array.from(select.options)
                      .map((option) => clean(option.textContent))
                      .filter(Boolean)
                      .slice(0, 40)
                  : undefined,
              selected_options:
                element instanceof HTMLSelectElement
                  ? Array.from(select.selectedOptions)
                      .map((option) => clean(option.textContent))
                      .filter(Boolean)
                      .slice(0, 20)
                  : undefined,
              required: input.required,
              disabled: input.disabled,
            }
          })

      const forms = Array.from(document.forms)
        .filter(visible)
        .slice(0, 30)
        .map((form) => ({
          action: form.action || undefined,
          method: (form.method || "get").toUpperCase(),
          label: labelFor(form) || undefined,
          controls: controlsFor(form),
        }))

      const buttons = Array.from(
        document.querySelectorAll(
          "button, input[type=button], input[type=submit], input[type=reset], [role=button]"
        )
      )
        .filter(visible)
        .slice(0, maxElements)
        .map((element) => ({
          role: "button" as const,
          label: labelFor(element),
          disabled:
            element instanceof HTMLButtonElement ||
            element instanceof HTMLInputElement
              ? element.disabled
              : element.getAttribute("aria-disabled") === "true",
        }))
        .filter((item) => item.label)

      const links = Array.from(document.querySelectorAll("a[href]"))
        .filter(visible)
        .slice(0, maxElements)
        .map((element) => ({
          role: "link" as const,
          label: labelFor(element),
          href: (element as HTMLAnchorElement).href,
        }))
        .filter((item) => item.label)

      const jsonLd = Array.from(
        document.querySelectorAll('script[type="application/ld+json"]')
      )
        .slice(0, 20)
        .flatMap((script) => {
          try {
            const raw = (script.textContent ?? "").slice(0, 50_000)
            const value: unknown = JSON.parse(raw)
            return Array.isArray(value) ? value : [value]
          } catch {
            return []
          }
        })
        .slice(0, 50)

      return {
        title: clean(document.title, 500),
        meta,
        visibleText: clean(document.body?.innerText, maxTextChars),
        semanticDom,
        jsonLd,
        forms,
        buttons,
        links,
      }
    },
    { maxTextChars: config.MAX_TEXT_CHARS, maxElements: config.MAX_ELEMENTS }
  )

  let accessibility = ""
  try {
    accessibility = normalizeText(
      await page.locator("body").ariaSnapshot({ timeout: 2_000 }),
      15_000
    )
  } catch {
    // Semantic DOM and explicit roles remain available when the snapshot fails.
  }

  return {
    requestedUrl,
    finalUrl: page.url(),
    ...collected,
    accessibility,
  }
}

export class PageCollector {
  constructor(
    private readonly browsers: BrowserManager,
    private readonly config: AppConfig
  ) {}

  async collect(url: string): Promise<PageSignals> {
    await assertPublicHttpUrl(url)
    const browser = await this.browsers.getBrowser()
    let context: BrowserContext | undefined

    try {
      context = await browser.newContext({
        javaScriptEnabled: true,
        userAgent: "404.directory AgentPageModel/0.1",
        viewport: { width: 1365, height: 900 },
      })
      context.setDefaultTimeout(this.config.PAGE_TIMEOUT_MS)
      context.setDefaultNavigationTimeout(this.config.PAGE_TIMEOUT_MS)

      const rejectedHosts = new Set<string>()
      await context.route("**/*", (route) => protectRoute(route, rejectedHosts))

      const page = await context.newPage()
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: this.config.PAGE_TIMEOUT_MS,
      })
      await assertPublicHttpUrl(page.url())

      const wait = await waitForPageStability(page, {
        networkIdleMs: this.config.NETWORK_IDLE_MS,
        stabilityPollMs: this.config.STABILITY_POLL_MS,
        maxWaitMs: this.config.MAX_WAIT_MS,
      })
      await assertPublicHttpUrl(page.url())

      const signals = await collectFromPage(page, url, this.config)
      return { ...signals, wait }
    } finally {
      await context?.close()
    }
  }
}
