#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { OptionalLlmAnalyzer } from "../analysis/llm.js"
import { BrowserManager } from "../browser/browser-manager.js"
import { PageCollector } from "../browser/collector.js"
import { loadConfig } from "../config.js"
import { createToolRegistry } from "../tools/create-registry.js"
import { UnderstandService } from "../understand.js"
import { createMcpServerFromRegistry } from "./create-server.js"

const config = loadConfig()
const browsers = new BrowserManager(config.HEADLESS)
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
const server = createMcpServerFromRegistry(registry)

const transport = new StdioServerTransport()
await server.connect(transport)

async function shutdown(): Promise<void> {
  await server.close()
  await browsers.close()
}

process.once("SIGINT", () => void shutdown())
process.once("SIGTERM", () => void shutdown())
