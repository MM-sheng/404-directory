import { createHash, timingSafeEqual } from "node:crypto"

type HeaderValue = string | string[] | undefined
type Headers = Record<string, HeaderValue>

function firstHeader(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest()
}

function bearerToken(value: HeaderValue): string | undefined {
  const header = firstHeader(value)?.trim()
  if (!header) return undefined
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim()
}

export class ApiKeyAuthenticator {
  private readonly keyDigests: Buffer[]

  constructor(keys: readonly string[]) {
    this.keyDigests = keys.map(digest)
  }

  get enabled(): boolean {
    return this.keyDigests.length > 0
  }

  keyId(headers: Headers): string | undefined {
    const candidate =
      firstHeader(headers["x-api-key"])?.trim() ||
      bearerToken(headers.authorization)
    if (!candidate) return undefined

    const candidateDigest = digest(candidate)
    const matched = this.keyDigests.find((configured) =>
      timingSafeEqual(configured, candidateDigest)
    )
    return matched ? matched.toString("hex").slice(0, 16) : undefined
  }

  rateLimitKey(headers: Headers, fallbackIp: string): string {
    const keyId = this.keyId(headers)
    if (keyId) return `key:${keyId}`

    const vercelIp = firstHeader(headers["x-vercel-forwarded-for"])
      ?.split(",")[0]
      ?.trim()
    const source = (vercelIp || fallbackIp).slice(0, 200)
    return `ip:${digest(source).toString("hex").slice(0, 16)}`
  }
}
