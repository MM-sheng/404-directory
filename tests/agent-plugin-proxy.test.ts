import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  loadAgentId,
  parseSseMessages,
} from "../scripts/agent-plugin-proxy.mjs"
import {
  defaultDataDirectory,
  identityDirectory,
  invokedAsMain,
  loadAgentId as loadUniversalAgentId,
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
})
