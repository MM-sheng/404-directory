import type { CatalogStore } from "./store.js"
import type { CatalogTool } from "./types.js"
import { getCatalogTool } from "./discovery.js"

export type CapabilityEdge = {
  source_tool_id: string
  source_slug: string
  target_tool_id: string
  target_slug: string
  shared_capabilities: string[]
  similarity: number
  relation: "shares_capability"
}

export type CapabilityNode = {
  tool_id: string
  slug: string
  name: string
  capabilities: string[]
  protocol: CatalogTool["protocol"]
  category: string | null
  overall_score: number | null
}

export type CapabilityGraphSnapshot = {
  algorithm_version: "cap_v1"
  nodes: CapabilityNode[]
  edges: CapabilityEdge[]
  capabilities: Array<{ capability: string; tool_count: number }>
}

export type RelatedTool = {
  tool: CatalogTool
  similarity: number
  shared_capabilities: string[]
  reason: string
}

function normalizeCap(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Jaccard similarity over capability sets, with a small boost when protocol
 * or category match. Pure function — no I/O — so the graph stays explainable.
 */
export function capabilitySimilarity(
  a: Pick<CatalogTool, "capabilities" | "protocol" | "category">,
  b: Pick<CatalogTool, "capabilities" | "protocol" | "category">
): { similarity: number; shared: string[] } {
  const setA = new Set(a.capabilities.map(normalizeCap).filter(Boolean))
  const setB = new Set(b.capabilities.map(normalizeCap).filter(Boolean))
  const shared = [...setA].filter((cap) => setB.has(cap))
  const union = new Set([...setA, ...setB])
  const jaccard = union.size === 0 ? 0 : shared.length / union.size

  let boost = 0
  if (a.protocol && a.protocol === b.protocol) boost += 0.05
  if (a.category && a.category === b.category) boost += 0.05

  return {
    similarity: Number(Math.min(1, jaccard + boost).toFixed(4)),
    shared: shared.sort(),
  }
}

async function loadCatalogTools(
  store: CatalogStore,
  limit = 100
): Promise<CatalogTool[]> {
  return store.searchTools({ limit })
}

/**
 * Build an in-memory capability graph from the current catalog.
 * Edges exist when tools share ≥1 capability (or protocol+category affinity
 * yields similarity above threshold).
 */
export async function buildCapabilityGraph(
  store: CatalogStore,
  options: { limit?: number; minSimilarity?: number } = {}
): Promise<CapabilityGraphSnapshot> {
  const limit = options.limit ?? 100
  const minSimilarity = options.minSimilarity ?? 0.05
  const tools = await loadCatalogTools(store, limit)

  const nodes: CapabilityNode[] = tools.map((tool) => ({
    tool_id: tool.id,
    slug: tool.slug,
    name: tool.name,
    capabilities: tool.capabilities,
    protocol: tool.protocol,
    category: tool.category,
    overall_score: tool.trust?.overall_score ?? null,
  }))

  const edges: CapabilityEdge[] = []
  for (let i = 0; i < tools.length; i += 1) {
    for (let j = i + 1; j < tools.length; j += 1) {
      const left = tools[i]!
      const right = tools[j]!
      const { similarity, shared } = capabilitySimilarity(left, right)
      if (shared.length === 0 && similarity < minSimilarity) continue
      if (similarity < minSimilarity) continue
      edges.push({
        source_tool_id: left.id,
        source_slug: left.slug,
        target_tool_id: right.id,
        target_slug: right.slug,
        shared_capabilities: shared,
        similarity,
        relation: "shares_capability",
      })
    }
  }

  edges.sort((a, b) => b.similarity - a.similarity)

  const capabilityCounts = new Map<string, number>()
  for (const tool of tools) {
    for (const raw of tool.capabilities) {
      const cap = normalizeCap(raw)
      if (!cap) continue
      capabilityCounts.set(cap, (capabilityCounts.get(cap) ?? 0) + 1)
    }
  }

  const capabilities = [...capabilityCounts.entries()]
    .map(([capability, tool_count]) => ({ capability, tool_count }))
    .sort((a, b) => b.tool_count - a.tool_count || a.capability.localeCompare(b.capability))

  return {
    algorithm_version: "cap_v1",
    nodes,
    edges,
    capabilities,
  }
}

export async function listCapabilities(
  store: CatalogStore
): Promise<Array<{ capability: string; tool_count: number }>> {
  const graph = await buildCapabilityGraph(store, { limit: 100 })
  return graph.capabilities
}

export async function toolsForCapability(
  store: CatalogStore,
  capability: string,
  limit = 20
): Promise<CatalogTool[]> {
  return store.searchTools({ capability, limit })
}

/**
 * Recommend similar tools for an agent that already knows one tool/slug.
 * Ranked by capability similarity, then overall trust.
 */
export async function recommendRelatedTools(
  store: CatalogStore,
  idOrSlug: string,
  limit = 5
): Promise<RelatedTool[]> {
  const seed = await getCatalogTool(store, idOrSlug)
  if (!seed) return []

  const candidates = await loadCatalogTools(store, 100)
  const related: RelatedTool[] = []

  for (const candidate of candidates) {
    if (candidate.id === seed.id) continue
    const { similarity, shared } = capabilitySimilarity(seed, candidate)
    if (similarity <= 0 && shared.length === 0) continue
    if (similarity < 0.05 && shared.length === 0) continue

    const reason =
      shared.length > 0
        ? `Shares capabilities: ${shared.slice(0, 5).join(", ")}`
        : candidate.protocol === seed.protocol
          ? `Same protocol (${candidate.protocol})`
          : "Related by catalog affinity"

    related.push({
      tool: candidate,
      similarity,
      shared_capabilities: shared,
      reason,
    })
  }

  related.sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity
    return (
      (b.tool.trust?.overall_score ?? 0) - (a.tool.trust?.overall_score ?? 0)
    )
  })

  return related.slice(0, limit)
}
