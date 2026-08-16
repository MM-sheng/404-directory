import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import { connect, type AddressInfo, type Socket } from "node:net"
import type { Duplex } from "node:stream"
import { resolvePublicHttpUrl } from "./url.js"

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

export type SafeEgressProxyOptions = {
  allowedPorts: readonly number[]
  maxResponseBytes: number
}

function sanitizedHeaders(
  headers: IncomingHttpHeaders,
  host: string
): IncomingHttpHeaders {
  const safe: IncomingHttpHeaders = { host }
  for (const [name, value] of Object.entries(headers)) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase()) && name !== "host") {
      safe[name] = value
    }
  }
  return safe
}

function writeProxyError(
  response: ServerResponse | Duplex,
  status: 400 | 403 | 502,
  message: string
): void {
  if ("writeHead" in response) {
    if (!response.headersSent) {
      response.writeHead(status, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        connection: "close",
      })
    }
    response.end(message)
    return
  }

  if (response.writable) {
    const reason =
      status === 403
        ? "Forbidden"
        : status === 502
          ? "Bad Gateway"
          : "Bad Request"
    response.end(
      `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`
    )
  }
}

/**
 * Loopback-only forward proxy for Chromium.
 *
 * Every HTTP request and HTTPS CONNECT tunnel is resolved through the same
 * public-address policy as the tools, then connected to the exact IP that was
 * validated. This closes the browser's validation/request DNS-rebinding gap.
 */
export class SafeEgressProxy {
  private readonly allowedPorts: ReadonlySet<number>
  private readonly sockets = new Set<Socket>()
  private readonly server: Server
  private serverUrl?: string

  constructor(private readonly options: SafeEgressProxyOptions) {
    this.allowedPorts = new Set(options.allowedPorts)
    this.server = createServer((request, response) => {
      void this.handleHttp(request, response)
    })
    this.server.on("connect", (request, clientSocket, head) => {
      void this.handleConnect(request, clientSocket, head)
    })
    this.server.on("connection", (socket) => {
      this.sockets.add(socket)
      socket.once("close", () => this.sockets.delete(socket))
    })
    this.server.on("clientError", (_error, socket) => {
      writeProxyError(socket, 400, "Invalid proxy request")
    })
  }

  async start(): Promise<string> {
    if (this.serverUrl) return this.serverUrl

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error)
      this.server.once("error", onError)
      this.server.listen(0, "127.0.0.1", () => {
        this.server.off("error", onError)
        resolve()
      })
    })

    const address = this.server.address() as AddressInfo
    this.serverUrl = `http://127.0.0.1:${address.port}`
    return this.serverUrl
  }

  async close(): Promise<void> {
    this.serverUrl = undefined
    for (const socket of this.sockets) socket.destroy()
    if (!this.server.listening) return
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }

  private portAllowed(port: number): boolean {
    return this.allowedPorts.has(port)
  }

  private async handleHttp(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    try {
      if (!request.url) throw new Error("Proxy request URL is missing")
      const target = new URL(request.url)
      if (target.protocol !== "http:") {
        throw new Error("HTTPS requests must use CONNECT")
      }

      const port = target.port ? Number(target.port) : 80
      if (!this.portAllowed(port)) {
        writeProxyError(response, 403, "Destination port is not allowed")
        return
      }

      const resolved = await resolvePublicHttpUrl(target.toString())
      const address = resolved.addresses[0]
      if (!address) throw new Error("Hostname could not be resolved")

      const upstream = httpRequest(
        {
          hostname: address.address,
          family: address.family,
          port,
          path: `${target.pathname}${target.search}`,
          method: request.method,
          headers: sanitizedHeaders(request.headers, target.host),
        },
        (upstreamResponse) => {
          const headers = sanitizedHeaders(
            upstreamResponse.headers,
            target.host
          )
          delete headers.host
          response.writeHead(upstreamResponse.statusCode ?? 502, headers)

          let received = 0
          upstreamResponse.on("data", (chunk: Buffer) => {
            received += chunk.byteLength
            if (received > this.options.maxResponseBytes) {
              upstreamResponse.destroy(
                new Error("Browser resource exceeded the configured limit")
              )
              response.destroy()
              return
            }
            response.write(chunk)
          })
          upstreamResponse.once("end", () => response.end())
          upstreamResponse.once("error", () => response.destroy())
        }
      )

      upstream.once("error", () =>
        writeProxyError(response, 502, "Upstream request failed")
      )
      request.pipe(upstream)
    } catch {
      writeProxyError(response, 403, "Destination is not allowed")
    }
  }

  private async handleConnect(
    request: IncomingMessage,
    clientSocket: Duplex,
    head: Buffer
  ): Promise<void> {
    try {
      if (!request.url) throw new Error("CONNECT authority is missing")
      const target = new URL(`https://${request.url}`)
      const port = target.port ? Number(target.port) : 443
      if (!this.portAllowed(port)) {
        writeProxyError(clientSocket, 403, "Destination port is not allowed")
        return
      }

      const resolved = await resolvePublicHttpUrl(target.toString())
      const address = resolved.addresses[0]
      if (!address) throw new Error("Hostname could not be resolved")

      const upstream = connect({
        host: address.address,
        family: address.family,
        port,
      })
      this.sockets.add(upstream)
      upstream.once("close", () => this.sockets.delete(upstream))
      upstream.once("error", () => {
        writeProxyError(clientSocket, 502, "Upstream connection failed")
        clientSocket.destroy()
      })
      upstream.once("connect", () => {
        clientSocket.write(
          "HTTP/1.1 200 Connection Established\r\nProxy-Agent: 404.directory\r\n\r\n"
        )
        if (head.length > 0) upstream.write(head)
        clientSocket.pipe(upstream)
        upstream.pipe(clientSocket)
      })
    } catch {
      writeProxyError(clientSocket, 403, "Destination is not allowed")
    }
  }
}
