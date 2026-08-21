import type { IncomingMessage, RequestOptions } from "node:http"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { isIP } from "node:net"
import {
  resolvePublicHttpUrl,
  type ResolvedPublicUrl,
} from "./url.js"

export type PinnedResponse = {
  status: number
  headers: IncomingMessage["headers"]
  location?: string
  body: string
  contentType?: string
}

function readBodyLimited(
  response: IncomingMessage,
  maxBodyBytes: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0

    response.on("data", (chunk: Buffer) => {
      total += chunk.byteLength
      if (total > maxBodyBytes) {
        response.destroy()
        reject(new Error(`Response body exceeded ${maxBodyBytes} bytes`))
        return
      }
      chunks.push(chunk)
    })
    response.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    response.once("error", reject)
  })
}

export type PinnedRequestInit = {
  method?: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
  maxBodyBytes?: number
  userAgent?: string
}

/**
 * Connect to the exact public IP that passed DNS validation (anti-rebinding).
 */
export async function requestPinned(
  url: URL,
  address: { address: string; family: number },
  init: PinnedRequestInit = {}
): Promise<PinnedResponse> {
  const maxBodyBytes = init.maxBodyBytes ?? 64 * 1024
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      host: url.host,
      "user-agent": init.userAgent ?? "404.directory pinned-http/0.5",
      "accept-encoding": "identity",
      ...(init.headers ?? {}),
    }
    const sniHost = url.hostname.replace(/^\[|\]$/g, "")
    const servername = isIP(sniHost) === 0 ? url.hostname : undefined
    const requestOptions: RequestOptions = {
      protocol: url.protocol,
      hostname: address.address,
      family: address.family,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: init.method ?? "GET",
      headers,
      signal: init.signal,
      ...(url.protocol === "https:" && servername ? { servername } : {}),
    }
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      requestOptions,
      async (response) => {
        try {
          const body = await readBodyLimited(response, maxBodyBytes)
          const contentType =
            typeof response.headers["content-type"] === "string"
              ? response.headers["content-type"]
              : undefined
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            location:
              typeof response.headers.location === "string"
                ? response.headers.location
                : undefined,
            body,
            contentType,
          })
        } catch (error) {
          reject(error)
        }
      }
    )
    request.once("error", reject)
    if (init.body) request.write(init.body)
    request.end()
  })
}

export async function pinnedRequestUrl(
  input: string,
  init: PinnedRequestInit = {}
): Promise<PinnedResponse & { resolved: ResolvedPublicUrl }> {
  const resolved = await resolvePublicHttpUrl(input)
  const address = resolved.addresses[0]
  if (!address) throw new Error("Hostname could not be resolved")
  const response = await requestPinned(resolved.url, address, init)
  return { ...response, resolved }
}

/**
 * Fetch-compatible wrapper pinned to a pre-resolved public destination.
 * Used by MCP SDK client transport to avoid a second unvalidated DNS lookup.
 */
export function createPinnedFetch(
  resolved: ResolvedPublicUrl
): typeof fetch {
  const address = resolved.addresses[0]
  if (!address) throw new Error("Hostname could not be resolved")

  return async (input, init) => {
    const target =
      typeof input === "string"
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url)

    if (
      target.hostname !== resolved.url.hostname ||
      target.protocol !== resolved.url.protocol
    ) {
      throw new Error("Pinned fetch refused host/protocol change")
    }

    const headers: Record<string, string> = {}
    if (init?.headers) {
      const h = new Headers(init.headers)
      h.forEach((value, key) => {
        headers[key] = value
      })
    }

    let body: string | undefined
    if (typeof init?.body === "string") body = init.body
    else if (init?.body != null) body = String(init.body)

    const response = await requestPinned(target, address, {
      method: init?.method,
      headers,
      body,
      signal: init?.signal ?? undefined,
      maxBodyBytes: 256 * 1024,
    })

    return new Response(response.body, {
      status: response.status,
      headers: response.contentType
        ? { "content-type": response.contentType }
        : undefined,
    })
  }
}
