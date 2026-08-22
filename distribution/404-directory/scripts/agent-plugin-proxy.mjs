#!/usr/bin/env node

import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createInterface } from "node:readline"
import path from "node:path"
import { pathToFileURL } from "node:url"

const ENDPOINT = "https://404.directory/mcp"
const AGENT_ID_PATTERN =
  /^agent:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_SOURCE = /^[a-z0-9][a-z0-9._-]{0,63}$/

export async function loadAgentId(dataDirectory) {
  if (!dataDirectory) {
    throw new Error("PLUGIN_DATA is required by the Agent Plugins runtime")
  }

  await mkdir(dataDirectory, { recursive: true })
  const identityPath = path.join(dataDirectory, "404-directory-agent-id")

  try {
    const existing = (await readFile(identityPath, "utf8")).trim()
    if (AGENT_ID_PATTERN.test(existing)) return existing
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }

  const agentId = `agent:${randomUUID()}`
  await writeFile(identityPath, `${agentId}\n`, { mode: 0o600 })
  return agentId
}

export function parseSseMessages(body) {
  const messages = []
  const events = body.replace(/\r\n/g, "\n").split(/\n\n+/)

  for (const event of events) {
    const data = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n")

    if (!data || data === "[DONE]") continue
    messages.push(JSON.parse(data))
  }

  return messages
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function requestId(message) {
  return message && typeof message === "object" && "id" in message
    ? message.id
    : undefined
}

function writeForwardingError(message, error) {
  const id = requestId(message)
  if (id === undefined) {
    process.stderr.write(
      `404.directory MCP forwarding error: ${error.message}\n`
    )
    return
  }

  writeMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code: -32000,
      message: `404.directory MCP forwarding error: ${error.message}`,
    },
  })
}

export async function runProxy({
  endpoint = ENDPOINT,
  dataDirectory = process.env.PLUGIN_DATA,
  source = process.env.DIRECTORY_404_SOURCE ?? "agent-plugin",
  agentClass = process.env.DIRECTORY_404_AGENT_CLASS,
} = {}) {
  const agentId = await loadAgentId(dataDirectory)
  const safeSource = SAFE_SOURCE.test(source) ? source : "agent-plugin"
  let sessionId
  let protocolVersion
  let clientName

  const headers = () => {
    const result = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "X-404-Agent-ID": agentId,
      "X-404-Source": safeSource,
    }
    if (agentClass === "internal") result["X-404-Agent-Class"] = "internal"
    if (clientName) result["X-404-Client-Name"] = clientName
    if (sessionId) result["Mcp-Session-Id"] = sessionId
    if (sessionId && protocolVersion) {
      result["MCP-Protocol-Version"] = protocolVersion
    }
    return result
  }

  const input = createInterface({ input: process.stdin, crlfDelay: Infinity })

  for await (const line of input) {
    if (!line.trim()) continue

    let message
    try {
      message = JSON.parse(line)
    } catch {
      writeMessage({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      })
      continue
    }

    if (message?.method === "initialize") {
      protocolVersion = message.params?.protocolVersion
      const requestedName = message.params?.clientInfo?.name
      if (typeof requestedName === "string") {
        clientName = requestedName.replace(/[\r\n]/g, " ").slice(0, 96)
      }
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(message),
      })

      sessionId = response.headers.get("mcp-session-id") ?? sessionId

      if (response.status === 202 || response.status === 204) continue

      const body = await response.text()
      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`
        )
      }

      const contentType = response.headers.get("content-type") ?? ""
      const messages = contentType.includes("text/event-stream")
        ? parseSseMessages(body)
        : [JSON.parse(body)]
      for (const forwarded of messages) writeMessage(forwarded)
    } catch (error) {
      writeForwardingError(
        message,
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  if (sessionId) {
    await fetch(endpoint, { method: "DELETE", headers: headers() }).catch(
      () => {}
    )
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runProxy().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    )
    process.exitCode = 1
  })
}
