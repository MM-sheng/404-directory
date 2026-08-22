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
      url?: string
      headers?: Record<string, string>
      command?: string
      args?: string[]
      env?: Record<string, string>
    }
  >
}

type ClaudePluginManifest = {
  name: string
  version: string
  mcpServers: string
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
      type: "stdio",
      command: "node",
      args: ["${PLUGIN_ROOT}/scripts/agent-plugin-proxy.mjs"],
    })
  })

  it("publishes a native Claude plugin with persistent identity storage", async () => {
    const manifest = await readJson<ClaudePluginManifest>(
      ".claude-plugin/plugin.json"
    )
    const config = await readJson<McpConfig>(".claude-plugin/mcp.json")
    const packageManifest = await readJson<{ version: string }>("package.json")

    expect(manifest).toMatchObject({
      name: "404-directory",
      version: packageManifest.version,
      mcpServers: "./.claude-plugin/mcp.json",
    })
    expect(config.mcpServers["404-directory"]).toEqual({
      command: "node",
      args: ["${CLAUDE_PLUGIN_ROOT}/scripts/agent-plugin-proxy.mjs"],
      env: {
        PLUGIN_DATA: "${CLAUDE_PLUGIN_DATA}",
        DIRECTORY_404_SOURCE: "claude-plugin",
      },
    })
  })
})
