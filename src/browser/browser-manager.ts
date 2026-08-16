import { chromium, type Browser } from "playwright"

export class BrowserManager {
  private browserPromise?: Promise<Browser>

  constructor(private readonly headless = true) {}

  async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = chromium
        .launch({ headless: this.headless })
        .catch((error: unknown) => {
          this.browserPromise = undefined
          throw error
        })
    }
    return this.browserPromise
  }

  async close(): Promise<void> {
    const browserPromise = this.browserPromise
    this.browserPromise = undefined
    if (browserPromise) {
      const browser = await browserPromise.catch(() => undefined)
      await browser?.close()
    }
  }
}
