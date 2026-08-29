import type { CatalogStore } from "./store.js"
import type { CatalogTool, ToolSearchQuery } from "./types.js"
import { isDiscoverableStatus } from "./lifecycle.js"

export type GetCatalogToolOptions = {
  /** When true, return pending/deprecated tools (owner/admin paths only). */
  includeQuarantine?: boolean
}

/**
 * Agent-facing discovery: lexical relevance first, then trust + usage evidence.
 * Public discovery is active-only — pending tools stay quarantined.
 */
export async function searchCatalogTools(
  store: CatalogStore,
  query: ToolSearchQuery
): Promise<CatalogTool[]> {
  return store.searchTools({
    ...query,
    status: query.status ?? "active",
  })
}

export async function getCatalogTool(
  store: CatalogStore,
  idOrSlug: string,
  options: GetCatalogToolOptions = {}
): Promise<CatalogTool | null> {
  let tool: CatalogTool | null = null
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      idOrSlug
    )
  ) {
    tool = await store.getToolById(idOrSlug)
  } else {
    tool = await store.getToolBySlug(idOrSlug)
  }
  if (!tool) return null
  if (!options.includeQuarantine && !isDiscoverableStatus(tool.status)) {
    return null
  }
  return tool
}

export async function compareCatalogTools(
  store: CatalogStore,
  idsOrSlugs: string[],
  options: GetCatalogToolOptions = {}
): Promise<CatalogTool[]> {
  const tools: CatalogTool[] = []
  for (const key of idsOrSlugs.slice(0, 5)) {
    const tool = await getCatalogTool(store, key, options)
    if (tool) tools.push(tool)
  }
  return tools
}
