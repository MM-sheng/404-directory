import { OptionalLlmAnalyzer } from "./analysis/llm.js"
import { BrowserManager } from "./browser/browser-manager.js"
import { PageCollector } from "./browser/collector.js"
import { loadConfig } from "./config.js"
import { createCatalogStore } from "./domain/create-catalog.js"
import { seedFirstPartyTools } from "./domain/seed-first-party.js"
import { startVerificationWorker } from "./domain/verification.js"
import { buildApp } from "./http/app.js"
import { createToolRegistry } from "./tools/create-registry.js"
import { UnderstandService } from "./understand.js"

const config = loadConfig()
const browsers = new BrowserManager({
  headless: config.HEADLESS,
  allowedPorts: config.BROWSER_EGRESS_ALLOWED_PORTS,
  maxResourceBytes: config.BROWSER_MAX_RESOURCE_BYTES,
})
const collector = new PageCollector(browsers, config)
const llm = new OptionalLlmAnalyzer({
  enabled: config.ENABLE_LLM,
  baseUrl: config.MODEL_BASE_URL,
  apiKey: config.MODEL_API_KEY,
  model: config.MODEL_ID,
  timeoutMs: config.LLM_TIMEOUT_MS,
})
const service = new UnderstandService(
  collector,
  config.PAGE_TIMEOUT_MS + config.MAX_WAIT_MS + 2_000,
  llm
)
const registry = createToolRegistry(service, config)
const catalog = createCatalogStore(config)
const app = await buildApp(registry, config, catalog.store)

if (catalog.store && config.SEED_FIRST_PARTY_TOOLS) {
  try {
    const { seeded } = await seedFirstPartyTools(
      catalog.store,
      registry,
      config
    )
    app.log.info({ seeded }, "First-party tools seeded into catalog")
  } catch (error) {
    app.log.error({ err: error }, "Failed to seed first-party tools")
  }
}

const inlineWorker =
  catalog.store &&
  config.VERIFICATION_WORKER_ENABLED &&
  config.VERIFICATION_WORKER_MODE === "inline"

const worker = inlineWorker
  ? startVerificationWorker({
      store: catalog.store!,
      intervalMs: config.VERIFICATION_INTERVAL_MS,
      batchSize: config.VERIFICATION_BATCH_SIZE,
      enabled: true,
      log: (message, data) => app.log.info(data ?? {}, message),
    })
  : { stop: () => undefined }

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down")
  worker.stop()
  await app.close()
  await catalog.db?.close()
  await browsers.close()
  process.exit(0)
}

process.once("SIGINT", () => void shutdown("SIGINT"))
process.once("SIGTERM", () => void shutdown("SIGTERM"))

try {
  await app.listen({ host: config.HOST, port: config.PORT })
  app.log.info(
    {
      tools: registry.listActive().map((tool) => tool.name),
      catalog_backend: catalog.backend,
      discovery_api: Boolean(catalog.store),
      verification_worker_mode: config.VERIFICATION_WORKER_MODE,
    },
    "404.directory ready"
  )
} catch (error) {
  app.log.error(error)
  worker.stop()
  await catalog.db?.close()
  await browsers.close()
  process.exit(1)
}
