import type { AIProvider, StreamChatParams } from "@/lib/ai/provider"
import { toApiMessages } from "@/lib/ai/prompts"
import {
  getServerModelConfig,
  resolveModelId,
} from "@/lib/ai/server-config"

type OpenAIChatChunk = {
  choices?: Array<{
    delta?: { content?: string | null }
    finish_reason?: string | null
  }>
  error?: { message?: string }
}

/**
 * Server-only provider. Talks to any OpenAI-compatible chat completions API.
 * API keys never leave the server.
 */
export class OpenAICompatibleProvider implements AIProvider {
  async *streamChat({
    messages,
    model,
    settings,
    signal,
  }: StreamChatParams): AsyncIterable<string> {
    const config = getServerModelConfig()

    if (!config.apiKey) {
      throw new Error(
        "MODEL_API_KEY is not set. Add it to .env.local to enable live replies."
      )
    }

    const modelId = resolveModelId(model.kind, config.modelId)
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        stream: true,
        temperature: settings.temperature,
        top_p: settings.topP,
        max_tokens: settings.maxOutputTokens,
        messages: toApiMessages(messages, model, settings),
      }),
      signal,
    })

    if (!response.ok) {
      throw new Error(await readProviderError(response))
    }

    if (!response.body) {
      throw new Error("The model returned an empty stream.")
    }

    yield* parseSseTextStream(response.body, signal)
  }
}

async function* parseSseTextStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncIterable<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      if (signal?.aborted) {
        throw abortError()
      }

      const { done, value } = await reader.read()

      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const rawLine of lines) {
        const line = rawLine.trim()

        if (!line.startsWith("data:")) {
          continue
        }

        const data = line.slice(5).trim()

        if (!data) {
          continue
        }

        if (data === "[DONE]") {
          return
        }

        let payload: OpenAIChatChunk

        try {
          payload = JSON.parse(data) as OpenAIChatChunk
        } catch {
          continue
        }

        if (payload.error?.message) {
          throw new Error(payload.error.message)
        }

        const content = payload.choices?.[0]?.delta?.content

        if (content) {
          yield content
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function readProviderError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string }
      message?: string
    }

    return (
      payload.error?.message ??
      payload.message ??
      `Model request failed (${response.status}).`
    )
  } catch {
    return `Model request failed (${response.status}).`
  }
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError")
}
