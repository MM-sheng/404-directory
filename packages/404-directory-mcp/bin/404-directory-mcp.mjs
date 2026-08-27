#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"

const DEFAULT_ENDPOINT = "https://404.directory/mcp"
const AGENT_ID_PATTERN =
  /^agent:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_SOURCE = /^[a-z0-9][a-z0-9._-]{0,63}$/
const CLIENT_FAMILIES = [
  [/chatgpt|openai/i, "openai"],
  [/claude|anthropic/i, "claude"],
  [/cursor/i, "cursor"],
  [/cline/i, "cline"],
  [/codex/i, "codex"],
  [/eliza(?:os)?/i, "elizaos"],
  [/openclaw/i, "openclaw"],
  [/visual studio code|vscode/i, "vscode"],
  [/goose/i, "goose"],
  [/mcp[ /_-]?inspector/i, "mcp-inspector"],
]

export function defaultDataDirectory({
  platform = process.platform,
  environment = process.env,
  homeDirectory = os.homedir(),
} = {}) {
  if (environment.DIRECTORY_404_DATA_DIR) {
    return path.resolve(environment.DIRECTORY_404_DATA_DIR)
  }
  if (environment.PLUGIN_DATA) return path.resolve(environment.PLUGIN_DATA)

  if (platform === "win32") {
    const appData = environment.LOCALAPPDATA || environment.APPDATA
    return path.join(appData || homeDirectory, "404-directory")
  }
  if (platform === "darwin") {
    return path.join(
      homeDirectory,
      "Library",
      "Application Support",
      "404-directory"
    )
  }
  return path.join(
    environment.XDG_DATA_HOME || path.join(homeDirectory, ".local", "share"),
    "404-directory"
  )
}

export async function loadAgentId(dataDirectory = defaultDataDirectory()) {
  await mkdir(dataDirectory, { recursive: true })
  const identityPath = path.join(dataDirectory, "agent-id")

  try {
    const existing = (await readFile(identityPath, "utf8")).trim()
    if (AGENT_ID_PATTERN.test(existing)) return existing
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }

  const agentId = `agent:${randomUUID()}`
  try {
    await writeFile(identityPath, `${agentId}\n`, {
      flag: "wx",
      mode: 0o600,
    })
    return agentId
  } catch (error) {
    if (error?.code !== "EEXIST") throw error
    const existing = (await readFile(identityPath, "utf8")).trim()
    if (AGENT_ID_PATTERN.test(existing)) return existing
    throw new Error(
      `Refusing to overwrite invalid 404.directory identity file: ${identityPath}`
    )
  }
}

export function identityDirectory(dataDirectory, clientName = "unknown-client") {
  const clientKey = createHash("sha256")
    .update(clientName.trim().toLowerCase() || "unknown-client")
    .digest("hex")
    .slice(0, 24)
  return path.join(dataDirectory, "clients", clientKey)
}

export function parseCliOptions(args = process.argv.slice(2)) {
  let source
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument.startsWith("--source=")) {
      const value = argument.slice("--source=".length)
      if (!SAFE_SOURCE.test(value)) {
        throw new Error(
          "--source must be a lowercase, non-personal label using a-z, 0-9, dot, underscore, or hyphen"
        )
      }
      source = value
      continue
    }
    if (argument !== "--source") {
      throw new Error(`Unknown argument: ${argument}`)
    }
    const value = args[index + 1]
    if (!value || !SAFE_SOURCE.test(value)) {
      throw new Error(
        "--source must be a lowercase, non-personal label using a-z, 0-9, dot, underscore, or hyphen"
      )
    }
    source = value
    index += 1
  }
  return { source }
}

export function safeClientLabel(value) {
  if (!value) return "mcp-client"
  return (
    CLIENT_FAMILIES.find(([pattern]) => pattern.test(value))?.[1] ??
    "mcp-client"
  )
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
  endpoint = DEFAULT_ENDPOINT,
  dataDirectory = defaultDataDirectory(),
  source = process.env.DIRECTORY_404_SOURCE ?? "npx-proxy",
  agentClass = process.env.DIRECTORY_404_AGENT_CLASS,
  inputStream = process.stdin,
  request = fetch,
  write = writeMessage,
} = {}) {
  const safeSource = SAFE_SOURCE.test(source) ? source : "npx-proxy"
  let agentId
  let sessionId
  let protocolVersion
  let clientName
  let clientIdentityName

  const headers = ({ includeProtocolVersion = true } = {}) => {
    const result = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "X-404-Agent-ID": agentId,
      "X-404-Source": safeSource,
    }
    if (agentClass === "internal") result["X-404-Agent-Class"] = "internal"
    if (clientName) result["X-404-Client-Name"] = clientName
    if (sessionId) result["Mcp-Session-Id"] = sessionId
    if (includeProtocolVersion && protocolVersion) {
      result["MCP-Protocol-Version"] = protocolVersion
    }
    return result
  }

  const input = createInterface({ input: inputStream, crlfDelay: Infinity })

  for await (const line of input) {
    if (!line.trim()) continue

    let message
    try {
      message = JSON.parse(line)
    } catch {
      write({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      })
      continue
    }

    const initializeRequest = message?.method === "initialize"
    let requestedProtocolVersion
    if (message?.method === "initialize") {
      requestedProtocolVersion = message.params?.protocolVersion
      const requestedName = message.params?.clientInfo?.name
      if (typeof requestedName === "string") {
        clientIdentityName = requestedName.replace(/[\r\n]/g, " ").slice(0, 96)
        clientName = safeClientLabel(clientIdentityName)
      }
    }

    if (!agentId) {
      agentId = await loadAgentId(
        identityDirectory(dataDirectory, clientIdentityName)
      )
    }

    try {
      const response = await request(endpoint, {
        method: "POST",
        headers: headers({ includeProtocolVersion: !initializeRequest }),
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
      if (initializeRequest) {
        const negotiatedProtocolVersion = messages.find(
          (candidate) =>
            candidate &&
            typeof candidate === "object" &&
            candidate.id === message.id &&
            typeof candidate.result?.protocolVersion === "string"
        )?.result?.protocolVersion
        protocolVersion = negotiatedProtocolVersion ?? requestedProtocolVersion
      }
      for (const forwarded of messages) write(forwarded)
    } catch (error) {
      writeForwardingError(
        message,
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  if (sessionId) {
    await request(endpoint, { method: "DELETE", headers: headers() }).catch(
      () => {}
    )
  }
}

export async function invokedAsMain(
  invokedPath = process.argv[1],
  modulePath = fileURLToPath(import.meta.url)
) {
  if (!invokedPath) return false
  try {
    return (await realpath(invokedPath)) === (await realpath(modulePath))
  } catch {
    return false
  }
}

if (await invokedAsMain()) {
  let options
  try {
    options = parseCliOptions()
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    )
    process.exitCode = 2
  }

  if (options) {
    runProxy(options).catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`
      )
      process.exitCode = 1
    })
  }
}
