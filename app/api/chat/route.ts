import { NextResponse } from "next/server"

import { FakeProvider } from "@/lib/ai/fake-provider"
import { OpenAICompatibleProvider } from "@/lib/ai/openai-compatible"
import { isLiveModelConfigured } from "@/lib/ai/server-config"
import { getModel } from "@/lib/chat/defaults"
import type { ChatSettings, Message } from "@/types/chat"

export const runtime = "nodejs"

type ChatBody = {
  messages?: Array<Pick<Message, "role" | "content">>
  modelId?: string
  settings?: Partial<ChatSettings>
}

const DEFAULT_SETTINGS: ChatSettings = {
  systemPrompt: "",
  temperature: 0.7,
  topP: 1,
  maxOutputTokens: 2048,
  reasoning: false,
}

export async function POST(request: Request) {
  let body: ChatBody

  try {
    body = (await request.json()) as ChatBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const messages = normalizeMessages(body.messages)

  if (messages.length === 0) {
    return NextResponse.json(
      { error: "At least one message is required." },
      { status: 400 }
    )
  }

  const model = getModel(body.modelId ?? "")
  const settings = normalizeSettings(body.settings)
  const live = isLiveModelConfigured()
  const provider = live ? new OpenAICompatibleProvider() : new FakeProvider()
  const iterator = provider.streamChat({
    messages,
    model,
    settings,
    signal: request.signal,
  })[Symbol.asyncIterator]()

  // Resolve the first chunk before returning so configuration / upstream errors
  // can still become a JSON response instead of a broken 200 stream.
  let first: IteratorResult<string>

  try {
    first = await iterator.next()
  } catch (error) {
    if (isAbortError(error)) {
      return new Response(null, { status: 499 })
    }

    const message =
      error instanceof Error ? error.message : "Chat request failed."

    return NextResponse.json({ error: message }, { status: 502 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done && first.value) {
          controller.enqueue(encoder.encode(first.value))
        }

        while (true) {
          if (request.signal.aborted) {
            break
          }

          const next = await iterator.next()

          if (next.done) {
            break
          }

          controller.enqueue(encoder.encode(next.value))
        }

        controller.close()
      } catch (error) {
        if (isAbortError(error)) {
          controller.close()
          return
        }

        console.error(
          "[api/chat]",
          error instanceof Error ? error.message : error
        )
        controller.error(error)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Model-Mode": live ? "live" : "fake",
    },
  })
}

function normalizeMessages(input: ChatBody["messages"]): Message[] {
  if (!Array.isArray(input)) {
    return []
  }

  const now = Date.now()

  return input
    .filter(
      (message) =>
        message &&
        (message.role === "user" ||
          message.role === "assistant" ||
          message.role === "system") &&
        typeof message.content === "string"
    )
    .map((message, index) => ({
      id: `req-${index}`,
      role: message.role,
      content: message.content,
      createdAt: now,
    }))
}

function normalizeSettings(input: ChatBody["settings"]): ChatSettings {
  return {
    systemPrompt:
      typeof input?.systemPrompt === "string"
        ? input.systemPrompt
        : DEFAULT_SETTINGS.systemPrompt,
    temperature: clampNumber(
      input?.temperature,
      DEFAULT_SETTINGS.temperature,
      0,
      2
    ),
    topP: clampNumber(input?.topP, DEFAULT_SETTINGS.topP, 0, 1),
    maxOutputTokens: Math.round(
      clampNumber(
        input?.maxOutputTokens,
        DEFAULT_SETTINGS.maxOutputTokens,
        16,
        8192
      )
    ),
    reasoning:
      typeof input?.reasoning === "boolean"
        ? input.reasoning
        : DEFAULT_SETTINGS.reasoning,
  }
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, value))
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  )
}
