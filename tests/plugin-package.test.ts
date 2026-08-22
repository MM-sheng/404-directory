import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

type PluginManifest = {
  $schema: string
  name: string
  version: string
}

type McpConfig = {
  $schema: string
  mcpServers: Record<
    string,
    {
      type: string
      url: string
      headers?: Record<string, string>
    }
  >
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T
}

describe("Agent Plugins package", () => {
  it("publishes the portable root manifest", async () => {
    const manifest = await readJson<PluginManifest>("plugin.json")
    const packageManifest = await readJson<{ version: string }>("package.json")

    expect(manifest.$schema).toBe(
      "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
    )
    expect(manifest.name).toBe("404-directory")
    expect(manifest.version).toBe(packageManifest.version)
  })

  it("publishes the portable remote MCP configuration", async () => {
    const config = await readJson<McpConfig>("mcp.json")

    expect(config.$schema).toBe(
      "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"
    )
    expect(config.mcpServers["404-directory"]).toEqual({
      type: "streamable-http",
      url: "https://404.directory/mcp",
      headers: { "X-404-Source": "agent-plugin" },
    })
  })
})
