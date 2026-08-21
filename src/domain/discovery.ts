import type { CatalogStore } from "./store.js"
import type { CatalogTool, ToolSearchQuery } from "./types.js"

/**
 * Agent-facing discovery: rank by trust + usage, filter by capability/protocol.
 * This is the catalog search layer — not the first-party executable /tools list.
 */
export async function searchCatalogTools(
  store: CatalogStore,
  query: ToolSearchQuery
): Promise<CatalogTool[]> {
  return store.searchTools(query)
}

export async function getCatalogTool(
  store: CatalogStore,
  idOrSlug: string
): Promise<CatalogTool | null> {
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      idOrSlug
    )
  ) {
    return store.getToolById(idOrSlug)
  }
  return store.getToolBySlug(idOrSlug)
}

export async function compareCatalogTools(
  store: CatalogStore,
  idsOrSlugs: string[]
): Promise<CatalogTool[]> {
  const tools: CatalogTool[] = []
  for (const key of idsOrSlugs.slice(0, 5)) {
    const tool = await getCatalogTool(store, key)
    if (tool) tools.push(tool)
  }
  return tools
}
