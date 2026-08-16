import type { AppConfig } from "../config.js"
import type { UnderstandService } from "../understand.js"
import { createUnderstandWebpageTool } from "./definitions/understand-webpage.js"
import { createVerifyWebTool } from "./definitions/verify-web.js"
import { ToolRegistry } from "./registry.js"

export function createToolRegistry(
  service: UnderstandService,
  config: AppConfig
): ToolRegistry {
  return new ToolRegistry()
    .register(createUnderstandWebpageTool(service))
    .register(
      createVerifyWebTool({
        timeoutMs: config.VERIFY_TIMEOUT_MS,
        maxBodyBytes: config.VERIFY_MAX_BODY_BYTES,
        maxRedirects: config.VERIFY_MAX_REDIRECTS,
      })
    )
}
