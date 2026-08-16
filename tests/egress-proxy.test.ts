import { request as httpRequest } from "node:http"
import { connect } from "node:net"
import { afterEach, describe, expect, it } from "vitest"
import { SafeEgressProxy } from "../src/security/egress-proxy.js"

let proxy: SafeEgressProxy | undefined

afterEach(async () => {
  await proxy?.close()
  proxy = undefined
})

function httpViaProxy(proxyUrl: string, target: string): Promise<number> {
  const proxyAddress = new URL(proxyUrl)
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: proxyAddress.hostname,
        port: proxyAddress.port,
        method: "GET",
        path: target,
      },
      (response) => {
        response.resume()
        response.once("end", () => resolve(response.statusCode ?? 0))
      }
    )
    request.once("error", reject)
    request.end()
  })
}

function connectViaProxy(proxyUrl: string, authority: string): Promise<string> {
  const proxyAddress = new URL(proxyUrl)
  return new Promise((resolve, reject) => {
    const socket = connect({
      host: proxyAddress.hostname,
      port: Number(proxyAddress.port),
    })
    let response = ""
    socket.setEncoding("utf8")
    socket.once("connect", () => {
      socket.write(
        `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`
      )
    })
    socket.on("data", (chunk) => {
      response += chunk
    })
    socket.once("end", () => resolve(response))
    socket.once("error", reject)
  })
}

describe("SafeEgressProxy", () => {
  it("blocks HTTP requests to loopback", async () => {
    proxy = new SafeEgressProxy({
      allowedPorts: [80, 443],
      maxResponseBytes: 1_024 * 1_024,
    })
    const proxyUrl = await proxy.start()

    await expect(httpViaProxy(proxyUrl, "http://127.0.0.1/")).resolves.toBe(403)
  })

  it("blocks HTTPS CONNECT tunnels to loopback", async () => {
    proxy = new SafeEgressProxy({
      allowedPorts: [80, 443],
      maxResponseBytes: 1_024 * 1_024,
    })
    const proxyUrl = await proxy.start()

    await expect(connectViaProxy(proxyUrl, "127.0.0.1:443")).resolves.toMatch(
      /^HTTP\/1\.1 403/
    )
  })

  it("blocks destinations outside the port allowlist", async () => {
    proxy = new SafeEgressProxy({
      allowedPorts: [443],
      maxResponseBytes: 1_024 * 1_024,
    })
    const proxyUrl = await proxy.start()

    await expect(
      httpViaProxy(proxyUrl, "http://example.com:8080/")
    ).resolves.toBe(403)
  })
})
