/**
 * Standalone verification worker.
 *
 * Run separately from the HTTP process when VERIFICATION_WORKER_MODE=external:
 *   npm run worker:verify
 *
 * This keeps Playwright/API request latency isolated from catalog probes.
 */
import { loadConfig } from "../config.js"
import { createCatalogStore } from "../domain/create-catalog.js"
import { startVerificationWorker } from "../domain/verification.js"

const config = loadConfig()
const catalog = createCatalogStore(config)

if (!catalog.store) {
  console.error(
    "No catalog store available. Set DATABASE_URL or CATALOG_MEMORY_FALLBACK=true."
  )
  process.exit(1)
}

const log = (message: string, data?: Record<string, unknown>) => {
  console.log(
    JSON.stringify({
      level: "info",
      time: new Date().toISOString(),
      msg: message,
      ...data,
    })
  )
}

log("verification_worker_starting", {
  backend: catalog.backend,
  interval_ms: config.VERIFICATION_INTERVAL_MS,
  batch_size: config.VERIFICATION_BATCH_SIZE,
})

const worker = startVerificationWorker({
  store: catalog.store,
  intervalMs: config.VERIFICATION_INTERVAL_MS,
  batchSize: config.VERIFICATION_BATCH_SIZE,
  enabled: true,
  log,
})

async function shutdown(signal: string): Promise<void> {
  log("verification_worker_stopping", { signal })
  worker.stop()
  await catalog.db?.close()
  process.exit(0)
}

process.once("SIGINT", () => void shutdown("SIGINT"))
process.once("SIGTERM", () => void shutdown("SIGTERM"))
