import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  loadAgentId,
  parseSseMessages,
} from "../scripts/agent-plugin-proxy.mjs"

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
})
