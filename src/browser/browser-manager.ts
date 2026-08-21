import { chromium, type Browser } from "playwright"
import { SafeEgressProxy } from "../security/egress-proxy.js"

export type BrowserManagerOptions = {
  headless?: boolean
  allowedPorts: readonly number[]
  maxResourceBytes: number
}

export class BrowserManager {
  private browserPromise?: Promise<Browser>
  private readonly proxy: SafeEgressProxy

  constructor(private readonly options: BrowserManagerOptions) {
    this.proxy = new SafeEgressProxy({
      allowedPorts: options.allowedPorts,
      maxResponseBytes: options.maxResourceBytes,
    })
  }

  async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = this.proxy
        .start()
        .then((proxyUrl) =>
          chromium.launch({
            headless: this.options.headless ?? true,
            proxy: { server: proxyUrl },
            // Chromium normally bypasses proxies for loopback destinations.
            // Disable that implicit bypass so private/loopback URLs must pass
            // through SafeEgressProxy and its pinned-IP checks.
            args: [
              "--proxy-bypass-list=<-loopback>",
              "--disable-dev-shm-usage",
              "--disable-quic",
              "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
            ],
          })
        )
        .catch(async (error: unknown) => {
          this.browserPromise = undefined
          await this.proxy.close()
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
    await this.proxy.close()
  }
}
