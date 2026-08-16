import type { LookupAddress } from "node:dns"
import { lookup } from "node:dns/promises"
import ipaddr from "ipaddr.js"

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsafeUrlError"
  }
}

function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false

  let parsed = ipaddr.parse(address)
  if (parsed.kind() === "ipv6") {
    const ipv6 = parsed as ipaddr.IPv6
    if (ipv6.isIPv4MappedAddress()) parsed = ipv6.toIPv4Address()
  }

  return parsed.range() === "unicast"
}

export type ResolvedPublicUrl = {
  url: URL
  addresses: LookupAddress[]
}

export async function resolvePublicHttpUrl(
  input: string
): Promise<ResolvedPublicUrl> {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new UnsafeUrlError("URL is invalid")
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs are allowed")
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs containing credentials are not allowed")
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "")
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new UnsafeUrlError("Local hostnames are not allowed")
  }

  let addresses: LookupAddress[]
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw new UnsafeUrlError("Hostname could not be resolved")
  }

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new UnsafeUrlError(
      "URL resolves to a private or reserved network address"
    )
  }

  return { url, addresses }
}

export async function assertPublicHttpUrl(input: string): Promise<URL> {
  return (await resolvePublicHttpUrl(input)).url
}

export const __testing = { isPublicAddress }
