import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema.js"

export type Database = PostgresJsDatabase<typeof schema>

export type DbHandle = {
  db: Database
  sql: ReturnType<typeof postgres>
  close: () => Promise<void>
}

/**
 * Opens a Postgres connection when DATABASE_URL is set.
 * Returns null when unset so first-party tools keep working without the catalog.
 */
export function openDatabase(databaseUrl: string | undefined): DbHandle | null {
  if (!databaseUrl) return null

  const sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  })
  const db = drizzle(sql, { schema })
  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 })
    },
  }
}
