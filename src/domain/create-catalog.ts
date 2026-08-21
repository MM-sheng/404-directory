import type { AppConfig } from "../config.js"
import { openDatabase, type DbHandle } from "../db/client.js"
import { MemoryCatalogStore } from "./memory-store.js"
import { PostgresCatalogStore } from "./postgres-store.js"
import type { CatalogStore } from "./store.js"

export type CatalogBootstrap = {
  store: CatalogStore | null
  db: DbHandle | null
  backend: "postgres" | "memory" | "disabled"
}

/**
 * Prefer Postgres when DATABASE_URL is set.
 * Fall back to in-memory catalog for local/dev so /v1 + MCP discovery still work.
 */
export function createCatalogStore(config: AppConfig): CatalogBootstrap {
  const db = openDatabase(config.DATABASE_URL)
  if (db) {
    return {
      store: new PostgresCatalogStore(db.db),
      db,
      backend: "postgres",
    }
  }
  if (config.CATALOG_MEMORY_FALLBACK) {
    return {
      store: new MemoryCatalogStore(),
      db: null,
      backend: "memory",
    }
  }
  return { store: null, db: null, backend: "disabled" }
}
