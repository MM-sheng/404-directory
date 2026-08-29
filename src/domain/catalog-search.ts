import type { CatalogTool, ToolSearchQuery } from "./types.js"
import { isDiscoverableStatus } from "./lifecycle.js"

export const CATALOG_SEARCH_VERSION = "catalog-lexical-v2"

export type SearchCandidate = Pick<
  CatalogTool,
  | "id"
  | "slug"
  | "name"
  | "description"
  | "capabilities"
  | "category"
  | "protocol"
  | "status"
> & {
  provider: Pick<CatalogTool["provider"], "name" | "slug">
  trust: Pick<NonNullable<CatalogTool["trust"]>, "overall_score"> | null
  usage: Pick<CatalogTool["usage"], "invocations_7d">
}

const FILLER_WORDS = new Set([
  "a",
  "an",
  "the",
  "find",
  "show",
  "me",
  "please",
  "for",
  "with",
  "to",
  "that",
  "can",
  "help",
])

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim()
}

function words(value: string): string[] {
  return (normalize(value).match(/[\p{L}\p{N}]+/gu) ?? []).map((word) =>
    /^(doc|docs|documentation)$/.test(word) ? "documentation" : word
  )
}

export function searchTerms(q = ""): string[] {
  const all = [...new Set(words(q))]
  const meaningful = all.filter((word) => !FILLER_WORDS.has(word))
  // An all-filler query must not silently become an unfiltered catalog listing.
  return meaningful.length > 0 ? meaningful : all
}

export function matchesSearchFilters(
  tool: SearchCandidate,
  query: ToolSearchQuery
): boolean {
  const status = query.status ?? "active"
  if (status === "active" && !isDiscoverableStatus(tool.status)) return false
  if (status === "all" && tool.status === "suspended") return false
  if (status !== "active" && status !== "all" && tool.status !== status)
    return false
  if (query.protocol && query.protocol !== tool.protocol) return false
  if (query.category && query.category !== tool.category) return false
  const capability = normalize(query.capability ?? "")
  if (
    capability &&
    !tool.capabilities.some((value) => normalize(value).includes(capability))
  )
    return false
  return (
    query.trust_threshold === undefined ||
    (tool.trust?.overall_score ?? 0) >= query.trust_threshold
  )
}

/** Deterministic lexical matching, not semantic inference or a safety score. */
export function searchRelevance(
  tool: SearchCandidate,
  query: string | undefined
): number | null {
  if (!query?.trim()) return 0
  const terms = searchTerms(query)
  if (terms.length === 0) return null
  const fields = [
    { words: words(tool.slug), weight: 12 },
    { words: words(tool.name), weight: 12 },
    { words: words(tool.capabilities.join(" ")), weight: 8 },
    { words: words(`${tool.provider.name} ${tool.provider.slug}`), weight: 6 },
    { words: words(tool.category ?? ""), weight: 3 },
    { words: words(tool.description), weight: 1 },
  ]
  const matches = (word: string, term: string) =>
    word === term || (term.length >= 3 && word.startsWith(term))
  let score = 0
  for (const term of terms) {
    const weight = Math.max(
      0,
      ...fields
        .filter((field) => field.words.some((word) => matches(word, term)))
        .map((field) => field.weight)
    )
    if (weight === 0) return null // All meaningful terms are required, across fields.
    score += weight
  }
  if (
    [tool.slug, tool.name].some(
      (value) => normalize(value) === normalize(query)
    )
  )
    score += 10_000
  if (
    fields.some((field) =>
      ` ${field.words.join(" ")} `.includes(` ${terms.join(" ")} `)
    )
  )
    score += 30
  return score
}

export function rankSearchCandidates<T extends SearchCandidate>(
  tools: T[],
  query: ToolSearchQuery
): T[] {
  return tools
    .filter((tool) => matchesSearchFilters(tool, query))
    .map((tool) => ({ tool, relevance: searchRelevance(tool, query.q) }))
    .filter(
      (item): item is { tool: T; relevance: number } => item.relevance !== null
    )
    .sort((a, b) => {
      if (a.relevance !== b.relevance) return b.relevance - a.relevance
      const adjustedTrust = (tool: T) =>
        (tool.trust?.overall_score ?? 0) -
        (tool.status === "degraded" ? 0.15 : 0)
      const trustDelta = adjustedTrust(b.tool) - adjustedTrust(a.tool)
      if (trustDelta !== 0) return trustDelta
      const usageDelta =
        b.tool.usage.invocations_7d - a.tool.usage.invocations_7d
      if (usageDelta !== 0) return usageDelta
      return a.tool.slug < b.tool.slug ? -1 : a.tool.slug > b.tool.slug ? 1 : 0
    })
    .slice(0, query.limit)
    .map(({ tool }) => tool)
}

export function toolSearchResponse(
  tools: CatalogTool[],
  query: ToolSearchQuery
) {
  return {
    count: tools.length,
    tools,
    search: {
      algorithm_version: CATALOG_SEARCH_VERSION,
      match_mode: "all_meaningful_terms",
      result_status: tools.length > 0 ? "matches" : "no_matches",
      filters: {
        status: query.status ?? "active",
        capability: query.capability ?? null,
        protocol: query.protocol ?? null,
        category: query.category ?? null,
        trust_threshold: query.trust_threshold ?? null,
      },
      ranking_notice:
        "Lexical relevance, then existing trust/usage evidence. Ranking is not a safety guarantee; preflight the exact tool before use.",
    },
    ...(tools.length === 0
      ? {
          recovery: {
            code: "no_matching_catalog_tools",
            message:
              "No catalog entries match all query terms and filters. This is not proof that a task is unsupported. Use a shorter provider/capability query or inspect available capability names, then retry explicitly. Do not relax status, trust, protocol or category constraints without a task-level reason.",
            next_step: {
              mcp_tool: "list_capabilities",
              http_path: "/v1/capabilities",
            },
            filters_preserved: true,
          },
        }
      : {}),
  }
}
