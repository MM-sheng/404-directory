import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import type { FastifyRequest } from "fastify"
import type { AppConfig } from "../config.js"
import type { CatalogStore, ProviderRecord } from "./store.js"

export const RESERVED_TOOL_SLUGS = new Set([
  "verify_web",
  "understand_webpage",
  "404_mcp",
  "search_tools",
  "get_tool",
  "compare_tools",
  "get_trust_score",
  "recommend_tools",
  "list_capabilities",
  "get_capability_graph",
])

export const RESERVED_PROVIDER_SLUGS = new Set(["404-directory", "404"])

export type RegistryAuth =
  | { kind: "admin" }
  | { kind: "provider"; provider: ProviderRecord }
  | { kind: "none" }

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex")
}

export function generateApiKey(): string {
  return `404_${randomBytes(24).toString("base64url")}`
}

export function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization
  if (!header || typeof header !== "string") return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() || null
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "hex")
    const right = Buffer.from(b, "hex")
    if (left.length !== right.length) return false
    return timingSafeEqual(left, right)
  } catch {
    return false
  }
}

/**
 * Resolve caller identity for registry write APIs.
 * Admin token OR provider API key (sha256 stored on provider metadata).
 */
export async function resolveRegistryAuth(
  request: FastifyRequest,
  store: CatalogStore,
  config: AppConfig
): Promise<RegistryAuth> {
  const token = extractBearerToken(request)
  if (!token) return { kind: "none" }

  if (config.REGISTRY_ADMIN_TOKEN && token === config.REGISTRY_ADMIN_TOKEN) {
    return { kind: "admin" }
  }

  const tokenHash = hashApiKey(token)
  // Provider lookup by scanning is O(n) for memory; for postgres we store hash
  // on metadata and search via tools' providers. Use getProviderByApiKeyHash.
  const provider = await store.getProviderByApiKeyHash(tokenHash)
  if (provider) return { kind: "provider", provider }
  return { kind: "none" }
}

export function requireWriteAuth(
  auth: RegistryAuth,
  config: AppConfig
): Exclude<RegistryAuth, { kind: "none" }> | { kind: "open" } {
  if (!config.REGISTRY_REQUIRE_AUTH) {
    return auth.kind === "none" ? { kind: "open" } : auth
  }
  if (auth.kind === "none") {
    throw new AuthError("Authentication required for registry writes")
  }
  return auth
}

export class AuthError extends Error {
  readonly statusCode = 401
  constructor(message: string) {
    super(message)
    this.name = "AuthError"
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403
  constructor(message: string) {
    super(message)
    this.name = "ForbiddenError"
  }
}

export function assertProviderAccess(
  auth: RegistryAuth | { kind: "open" },
  providerSlug: string
): void {
  if (auth.kind === "admin" || auth.kind === "open") return
  if (auth.kind === "provider" && auth.provider.slug === providerSlug) return
  if (auth.kind === "none") {
    throw new AuthError("Authentication required")
  }
  throw new ForbiddenError("Provider API key does not match this provider")
}

export function assertCanRegisterToolSlug(slug: string): void {
  if (RESERVED_TOOL_SLUGS.has(slug.toLowerCase())) {
    throw new ForbiddenError(`Tool slug is reserved: ${slug}`)
  }
}

export function assertCanRegisterProviderSlug(slug: string): void {
  if (RESERVED_PROVIDER_SLUGS.has(slug.toLowerCase())) {
    throw new ForbiddenError(`Provider slug is reserved: ${slug}`)
  }
}
