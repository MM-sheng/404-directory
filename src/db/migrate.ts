import { migrate } from "drizzle-orm/postgres-js/migrator"
import { openDatabase } from "./client.js"

/**
 * Applies SQL migrations from ./drizzle.
 * Usage: DATABASE_URL=postgres://... npm run db:migrate
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL is required to run migrations")
    process.exit(1)
  }

  const handle = openDatabase(url)
  if (!handle) {
    process.exit(1)
  }

  try {
    await migrate(handle.db, { migrationsFolder: "./drizzle" })
    console.log("Migrations applied")
  } finally {
    await handle.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
