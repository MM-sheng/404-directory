import { describe, expect, it } from "vitest"
import { __testing, assertPublicHttpUrl } from "../src/security/url.js"

describe("URL SSRF protection", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "198.18.0.1",
    "198.19.255.255",
    "::1",
    "fc00::1",
  ])("rejects non-public address %s", (address) => {
    expect(__testing.isPublicAddress(address)).toBe(false)
  })

  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])(
    "accepts public address %s",
    (address) => {
      expect(__testing.isPublicAddress(address)).toBe(true)
    }
  )

  it("rejects localhost without making a request", async () => {
    await expect(assertPublicHttpUrl("http://localhost/admin")).rejects.toThrow(
      /Local hostnames/
    )
  })

  it("rejects non-http protocols", async () => {
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow(
      /Only http and https/
    )
  })
})
