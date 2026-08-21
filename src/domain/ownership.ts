import { randomBytes } from "node:crypto"
import { promises as dns } from "node:dns"
import type { CatalogStore } from "./store.js"
import { refreshTrustForTool } from "./trust.js"

export const OWNERSHIP_TXT_PREFIX = "404-directory-verify="
export const OWNERSHIP_DNS_NAME = (domain: string) =>
  `_404-directory.${domain.replace(/\.$/, "")}`

export type DnsOwnershipChallenge = {
  method: "dns_txt"
  domain: string
  token: string
  record_name: string
  record_value: string
  created_at: string
  expires_at: string
}

export type GithubOwnershipChallenge = {
  method: "github_bio"
  login: string
  token: string
  instruction: string
  created_at: string
  expires_at: string
}

export type OwnershipChallenge = DnsOwnershipChallenge | GithubOwnershipChallenge

/**
 * Issue an ownership challenge for domain (DNS TXT) or github (profile bio).
 */
export async function createOwnershipChallenge(
  store: CatalogStore,
  providerSlug: string,
  options: { cooldownMs?: number; force?: boolean } = {}
): Promise<OwnershipChallenge> {
  const provider = await store.getProviderBySlug(providerSlug)
  if (!provider) {
    throw new Error(`Unknown provider: ${providerSlug}`)
  }

  const existing = provider.metadata.ownership_challenge as
    | OwnershipChallenge
    | undefined
  const cooldownMs = options.cooldownMs ?? 3_600_000
  if (
    !options.force &&
    existing?.created_at &&
    Date.now() - new Date(existing.created_at).getTime() < cooldownMs &&
    new Date(existing.expires_at).getTime() > Date.now()
  ) {
    throw new Error(
      "Ownership challenge recently issued; wait for cooldown or use the existing challenge"
    )
  }

  const token = randomBytes(16).toString("hex")
  const now = new Date()
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  let challenge: OwnershipChallenge

  if (provider.identity_type === "domain") {
    const domain = provider.identity_value
      .replace(/^https?:\/\//, "")
      .split("/")[0]!
    challenge = {
      method: "dns_txt",
      domain,
      token,
      record_name: OWNERSHIP_DNS_NAME(domain),
      record_value: `${OWNERSHIP_TXT_PREFIX}${token}`,
      created_at: now.toISOString(),
      expires_at: expires.toISOString(),
    }
  } else if (provider.identity_type === "github") {
    const login = provider.identity_value
      .replace(/^https?:\/\/(www\.)?github\.com\//, "")
      .replace(/\/.*$/, "")
      .replace(/^@/, "")
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(login)) {
      throw new Error("Invalid GitHub login in provider identity")
    }
    challenge = {
      method: "github_bio",
      login,
      token,
      instruction: `Add exactly "${OWNERSHIP_TXT_PREFIX}${token}" to your public GitHub profile bio, then call verify.`,
      created_at: now.toISOString(),
      expires_at: expires.toISOString(),
    }
  } else {
    throw new Error(
      "Ownership challenge currently supports domain or github identity"
    )
  }

  await store.setProviderMetadata(provider.slug, {
    ...provider.metadata,
    ownership_challenge: challenge,
  })

  return challenge
}

export type OwnershipVerifyResult = {
  verified: boolean
  provider_slug: string
  evidence: Record<string, unknown>
}

type GithubUserResponse = {
  login?: string
  bio?: string | null
}

async function defaultFetchGithubBio(login: string): Promise<string | null> {
  const response = await fetch(`https://api.github.com/users/${login}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "404.directory-ownership/0.1",
    },
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) {
    throw new Error(`github_api_${response.status}`)
  }
  const body = (await response.json()) as GithubUserResponse
  return body.bio ?? null
}

async function refreshProviderTools(
  store: CatalogStore,
  providerSlug: string,
  providerName: string
): Promise<void> {
  const tools = await store.searchTools({
    q: providerName,
    limit: 50,
    status: "all",
  })
  for (const tool of tools) {
    if (tool.provider.slug === providerSlug) {
      await refreshTrustForTool(store, tool.id)
    }
  }
}

/**
 * Verify ownership challenge (DNS TXT or GitHub bio).
 * Resolvers are injectable for tests.
 */
export async function verifyOwnershipChallenge(
  store: CatalogStore,
  providerSlug: string,
  options: {
    lookupTxt?: (hostname: string) => Promise<string[][]>
    fetchGithubBio?: (login: string) => Promise<string | null>
  } = {}
): Promise<OwnershipVerifyResult> {
  const provider = await store.getProviderBySlug(providerSlug)
  if (!provider) {
    throw new Error(`Unknown provider: ${providerSlug}`)
  }

  const challenge = provider.metadata.ownership_challenge as
    | OwnershipChallenge
    | undefined
  if (!challenge?.token) {
    throw new Error("No active ownership challenge for this provider")
  }
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    throw new Error("Ownership challenge expired; request a new one")
  }

  if (challenge.method === "dns_txt") {
    const lookupTxt = options.lookupTxt ?? dns.resolveTxt
    let records: string[][] = []
    try {
      records = await lookupTxt(challenge.record_name)
    } catch (error) {
      return {
        verified: false,
        provider_slug: provider.slug,
        evidence: {
          error:
            error instanceof Error
              ? ((error as NodeJS.ErrnoException).code ?? error.message)
              : "lookup_failed",
          record_name: challenge.record_name,
        },
      }
    }

    const flat = records.map((parts) => parts.join(""))
    const expected = challenge.record_value
    const matched = flat.some(
      (value) => value === expected || value.includes(expected)
    )

    if (!matched) {
      return {
        verified: false,
        provider_slug: provider.slug,
        evidence: {
          method: "dns_txt",
          record_name: challenge.record_name,
          found: flat.slice(0, 5),
          expected_prefix: OWNERSHIP_TXT_PREFIX,
        },
      }
    }

    await store.setProviderVerified(provider.slug, true, {
      ownership_method: "dns_txt",
      ownership_verified_at: new Date().toISOString(),
      ownership_challenge: {
        ...challenge,
        completed_at: new Date().toISOString(),
      },
    })
    await refreshProviderTools(store, provider.slug, provider.name)

    return {
      verified: true,
      provider_slug: provider.slug,
      evidence: {
        method: "dns_txt",
        record_name: challenge.record_name,
        matched: true,
      },
    }
  }

  if (challenge.method === "github_bio") {
    const fetchBio = options.fetchGithubBio ?? defaultFetchGithubBio
    let bio: string | null = null
    try {
      bio = await fetchBio(challenge.login)
    } catch (error) {
      return {
        verified: false,
        provider_slug: provider.slug,
        evidence: {
          method: "github_bio",
          login: challenge.login,
          error: error instanceof Error ? error.message : "github_fetch_failed",
        },
      }
    }

    const expected = `${OWNERSHIP_TXT_PREFIX}${challenge.token}`
    const matched = typeof bio === "string" && bio.includes(expected)
    if (!matched) {
      return {
        verified: false,
        provider_slug: provider.slug,
        evidence: {
          method: "github_bio",
          login: challenge.login,
          bio_present: Boolean(bio),
          expected_prefix: OWNERSHIP_TXT_PREFIX,
        },
      }
    }

    await store.setProviderVerified(provider.slug, true, {
      ownership_method: "github_bio",
      ownership_verified_at: new Date().toISOString(),
      ownership_challenge: {
        ...challenge,
        completed_at: new Date().toISOString(),
      },
    })
    await refreshProviderTools(store, provider.slug, provider.name)

    return {
      verified: true,
      provider_slug: provider.slug,
      evidence: {
        method: "github_bio",
        login: challenge.login,
        matched: true,
      },
    }
  }

  throw new Error("Unsupported ownership challenge method")
}
