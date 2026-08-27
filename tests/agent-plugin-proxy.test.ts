import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Readable } from "node:stream"
import { afterEach, describe, expect, it } from "vitest"
import {
  loadAgentId,
  parseSseMessages,
  safeClientLabel as safePluginClientLabel,
} from "../scripts/agent-plugin-proxy.mjs"
import {
  defaultDataDirectory,
  identityDirectory,
  invokedAsMain,
  loadAgentId as loadUniversalAgentId,
  parseCliOptions,
  runProxy,
  safeClientLabel,
} from "../packages/404-directory-mcp/bin/404-directory-mcp.mjs"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("Agent Plugin identity bridge", () => {
  it("persists one privacy-safe random Agent ID per plugin installation", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "404-plugin-test-"))
    temporaryDirectories.push(directory)

    const first = await loadAgentId(directory)
    const second = await loadAgentId(directory)
    const persisted = await readFile(
      path.join(directory, "404-directory-agent-id"),
      "utf8"
    )

    expect(first).toMatch(
      /^agent:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(second).toBe(first)
    expect(persisted.trim()).toBe(first)
  })

  it("keeps one plugin identity during concurrent first starts", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "404-plugin-race-"))
    temporaryDirectories.push(directory)

    const identities = await Promise.all(
      Array.from({ length: 12 }, () => loadAgentId(directory))
    )

    expect(new Set(identities)).toHaveLength(1)
  })

  it("extracts JSON-RPC messages from Streamable HTTP SSE responses", () => {
    expect(
      parseSseMessages(
        'event: message\r\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\r\n\r\n'
      )
    ).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }])
  })

  it("persists one identity for the universal npx bridge", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "404-npx-test-"))
    temporaryDirectories.push(directory)

    const first = await loadUniversalAgentId(directory)
    const second = await loadUniversalAgentId(directory)
    const persisted = await readFile(path.join(directory, "agent-id"), "utf8")

    expect(second).toBe(first)
    expect(persisted.trim()).toBe(first)
  })

  it("creates exactly one identity during concurrent first starts", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "404-race-test-"))
    temporaryDirectories.push(directory)

    const identities = await Promise.all(
      Array.from({ length: 12 }, () => loadUniversalAgentId(directory))
    )

    expect(new Set(identities)).toHaveLength(1)
  })

  it("refuses to overwrite an invalid identity file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "404-invalid-test-"))
    temporaryDirectories.push(directory)
    const identityPath = path.join(directory, "agent-id")
    await writeFile(identityPath, "do-not-overwrite\n")

    await expect(loadUniversalAgentId(directory)).rejects.toThrow(
      "Refusing to overwrite invalid 404.directory identity file"
    )
    await expect(readFile(identityPath, "utf8")).resolves.toBe(
      "do-not-overwrite\n"
    )
  })

  it("uses platform data directories without personal identifiers", () => {
    expect(
      defaultDataDirectory({
        platform: "linux",
        environment: { XDG_DATA_HOME: "/tmp/agent-data" },
        homeDirectory: "/tmp/home",
      })
    ).toBe(path.join("/tmp/agent-data", "404-directory"))

    expect(
      defaultDataDirectory({
        platform: "darwin",
        environment: {},
        homeDirectory: "/tmp/home",
      })
    ).toBe(path.join("/tmp/home", "Library", "Application Support", "404-directory"))

    const clientDirectory = identityDirectory(
      "/tmp/agent-data/404-directory",
      "Custom Client Name"
    )
    expect(clientDirectory).not.toContain("Custom Client Name")
    expect(clientDirectory).toMatch(/\/clients\/[0-9a-f]{24}$/)
  })

  it("recognizes the npm bin symlink as the executable entry point", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "404-bin-test-"))
    temporaryDirectories.push(directory)
    const modulePath = path.resolve(
      "packages/404-directory-mcp/bin/404-directory-mcp.mjs"
    )
    const binPath = path.join(directory, "404-directory-mcp")
    await symlink(modulePath, binPath)

    await expect(invokedAsMain(binPath, modulePath)).resolves.toBe(true)
  })

  it("accepts only safe non-personal source labels", () => {
    expect(parseCliOptions(["--source", "tensorblock"])).toEqual({
      source: "tensorblock",
    })
    expect(parseCliOptions(["--source=official-registry"])).toEqual({
      source: "official-registry",
    })
    expect(() => parseCliOptions(["--source=Personal Email@example.com"]))
      .toThrow("--source must be a lowercase, non-personal label")
    expect(() => parseCliOptions(["--source", "Personal Email@example.com"]))
      .toThrow("--source must be a lowercase, non-personal label")
    expect(() => parseCliOptions(["--endpoint", "https://example.com"])).toThrow(
      "Unknown argument: --endpoint"
    )
  })

  it("forwards the negotiated protocol version after initialization without requiring a session", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "404-protocol-test-"))
    temporaryDirectories.push(directory)
    const requests: Array<{ method: string; headers: Record<string, string> }> = []
    const responses = [
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            serverInfo: { name: "test", version: "1.0.0" },
          },
        }),
        { headers: { "content-type": "application/json" } }
      ),
      new Response(null, { status: 202 }),
      new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [] } }),
        { headers: { "content-type": "application/json" } }
      ),
    ]
    const input = Readable.from([
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "Cursor", version: "1.0.0" },
        },
      })}\n`,
      `${JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      })}\n`,
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      })}\n`,
    ])
    const output: unknown[] = []

    await runProxy({
      endpoint: "https://example.test/mcp",
      dataDirectory: directory,
      source: "test",
      inputStream: input,
      request: async (_url: string, init: RequestInit) => {
        requests.push({
          method: init.method ?? "GET",
          headers: init.headers as Record<string, string>,
        })
        const response = responses.shift()
        if (!response) throw new Error("Unexpected request")
        return response
      },
      write: (message: unknown) => output.push(message),
    })

    expect(requests).toHaveLength(3)
    expect(requests[0].headers["MCP-Protocol-Version"]).toBeUndefined()
    expect(requests[1].headers["MCP-Protocol-Version"]).toBe("2025-11-25")
    expect(requests[2].headers["MCP-Protocol-Version"]).toBe("2025-11-25")
    expect(output).toHaveLength(2)
  })

  it("never forwards arbitrary client names into analytics headers", () => {
    expect(safeClientLabel("Claude Code")).toBe("claude")
    expect(safeClientLabel("ElizaOS MCP Client")).toBe("elizaos")
    expect(safeClientLabel("OpenClaw")).toBe("openclaw")
    expect(safePluginClientLabel("OpenClaw Gateway")).toBe("openclaw")
    expect(safePluginClientLabel("Visual Studio Code")).toBe("vscode")
    expect(safeClientLabel("Alice's private workstation agent")).toBe(
      "mcp-client"
    )
    expect(safePluginClientLabel("bob@example.com")).toBe("mcp-client")
  })
})
