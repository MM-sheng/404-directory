#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { OptionalLlmAnalyzer } from "../analysis/llm.js"
import { BrowserManager } from "../browser/browser-manager.js"
import { PageCollector } from "../browser/collector.js"
import { loadConfig } from "../config.js"
import { createCatalogStore } from "../domain/create-catalog.js"
import { seedCuratedMcpServers } from "../domain/seed-curated-mcp.js"
import { seedFirstPartyTools } from "../domain/seed-first-party.js"
import { createToolRegistry } from "../tools/create-registry.js"
import { UnderstandService } from "../understand.js"
import { createMcpServerFromRegistry } from "./create-server.js"
import { createRemoteMcpGateway } from "./remote-gateway.js"

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
if (catalog.store && config.SEED_FIRST_PARTY_TOOLS) {
  await seedFirstPartyTools(catalog.store, registry, config).catch(
    () => undefined
  )
}
if (catalog.store && config.SEED_CURATED_MCP_SERVERS) {
  await seedCuratedMcpServers(catalog.store).catch(() => undefined)
}
const gateway =
  catalog.store && config.MCP_GATEWAY_ENABLED
    ? createRemoteMcpGateway({
        timeoutMs: config.MCP_GATEWAY_TIMEOUT_MS,
        maxResultBytes: config.MCP_GATEWAY_MAX_RESULT_BYTES,
      })
    : null
const server = createMcpServerFromRegistry(registry, catalog.store, gateway)

const transport = new StdioServerTransport()
await server.connect(transport)

async function shutdown(): Promise<void> {
  await server.close()
  await catalog.db?.close()
  await browsers.close()
}

process.once("SIGINT", () => void shutdown())
process.once("SIGTERM", () => void shutdown())
