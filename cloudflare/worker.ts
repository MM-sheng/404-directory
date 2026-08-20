import { Container, getContainer } from "@cloudflare/containers"
import type { DurableObjectNamespace } from "@cloudflare/workers-types"

/**
 * Cloudflare Container wrapper for the existing 404.directory API image.
 * The application itself stays in the Docker image so Playwright/Chromium
 * behavior remains unchanged during the hosting migration.
 */
export class DirectoryContainer extends Container {
  defaultPort = 4040
  requiredPorts = [4040]
  enableInternet = true
  sleepAfter = "10m"
  pingEndpoint = "health"
  envVars = {
    HOST: "0.0.0.0",
    PORT: "4040",
    PUBLIC_BASE_URL: "https://404.directory",
    HEADLESS: "true",
  }
}

interface Env {
  DIRECTORY_CONTAINER: DurableObjectNamespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return getContainer(env.DIRECTORY_CONTAINER, "404-directory").fetch(request)
  },
}
