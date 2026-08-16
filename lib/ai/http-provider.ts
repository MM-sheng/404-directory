import type { AIProvider, StreamChatParams } from "@/lib/ai/provider"
import type { ChatSettings, Message } from "@/types/chat"

type ChatRequestBody = {
  messages: Array<Pick<Message, "role" | "content">>
  modelId: string
  settings: ChatSettings
}

/**
 * Browser-side provider. Streams plain text from POST /api/chat.
 * Never holds model API keys.
 */
export class ApiChatProvider implements AIProvider {
  async *streamChat({
    messages,
    model,
    settings,
    signal,
  }: StreamChatParams): AsyncIterable<string> {
    const body: ChatRequestBody = {
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      modelId: model.id,
      settings,
    }

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      throw new Error(await readApiError(response))
    }

    if (!response.body) {
      throw new Error("The chat API returned an empty stream.")
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        const text = decoder.decode(value, { stream: true })

        if (text) {
          yield text
        }
      }

      const trailing = decoder.decode()

      if (trailing) {
        yield trailing
      }
    } finally {
      reader.releaseLock()
    }
  }
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string }
    return payload.error ?? `Chat request failed (${response.status}).`
  } catch {
    return `Chat request failed (${response.status}).`
  }
}
