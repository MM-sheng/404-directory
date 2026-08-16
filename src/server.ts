import { OptionalLlmAnalyzer } from "./analysis/llm.js"
import { BrowserManager } from "./browser/browser-manager.js"
import { PageCollector } from "./browser/collector.js"
import { loadConfig } from "./config.js"
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
const app = await buildApp(registry, config)

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down")
  await app.close()
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
    },
    "404.directory ready"
  )
} catch (error) {
  app.log.error(error)
  await browsers.close()
  process.exit(1)
}
