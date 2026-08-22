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

type ClaudeMarketplace = {
  name: string
  plugins: Array<{
    name: string
    source: string
    version: string
  }>
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
      "distribution/404-directory/.claude-plugin/plugin.json"
    )
    const config = await readJson<McpConfig>(
      "distribution/404-directory/.claude-plugin/mcp.json"
    )
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

  it("publishes a directly installable Claude marketplace", async () => {
    const marketplace = await readJson<ClaudeMarketplace>(
      ".claude-plugin/marketplace.json"
    )
    const packageManifest = await readJson<{ version: string }>("package.json")

    expect(marketplace.name).toBe("404-directory")
    expect(marketplace.plugins).toContainEqual(
      expect.objectContaining({
        name: "404-directory",
        source: "./distribution/404-directory",
        version: packageManifest.version,
      })
    )
  })

  it("keeps the lightweight Claude package synchronized and dependency-free", async () => {
    const [rootSkill, packagedSkill, rootProxy, packagedProxy] =
      await Promise.all([
        readFile("skills/use-404-directory/SKILL.md", "utf8"),
        readFile(
          "distribution/404-directory/skills/use-404-directory/SKILL.md",
          "utf8"
        ),
        readFile("scripts/agent-plugin-proxy.mjs", "utf8"),
        readFile(
          "distribution/404-directory/scripts/agent-plugin-proxy.mjs",
          "utf8"
        ),
      ])

    expect(packagedSkill).toBe(rootSkill)
    expect(packagedProxy).toBe(rootProxy)
    await expect(
      readFile("distribution/404-directory/package.json", "utf8")
    ).rejects.toMatchObject({ code: "ENOENT" })
  })
})
