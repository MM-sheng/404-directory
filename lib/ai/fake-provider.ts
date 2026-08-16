import type { AIProvider, StreamChatParams } from "@/lib/ai/provider"

const SIMULATED_RESPONSE = `This is a simulated response. Add \`MODEL_API_KEY\` to \`.env.local\` to switch \`POST /api/chat\` to a live OpenAI-compatible model.

The browser already streams from the server. Keys never leave \`.env.local\`.

\`\`\`bash
MODEL_BASE_URL=https://api.openai.com/v1
MODEL_API_KEY=sk-...
MODEL_ID=gpt-4o-mini
\`\`\`
`

const FIRST_TOKEN_LATENCY_MS = 780
const TOKEN_INTERVAL_MS = 38
const TOKEN_JITTER_MS = 18

export class FakeProvider implements AIProvider {
  async *streamChat({ signal }: StreamChatParams): AsyncIterable<string> {
    await wait(FIRST_TOKEN_LATENCY_MS, signal)

    for (const chunk of chunkText(SIMULATED_RESPONSE)) {
      yield chunk
      await wait(TOKEN_INTERVAL_MS + Math.random() * TOKEN_JITTER_MS, signal)
    }
  }
}

/** Word-sized chunks, so the stream reads like a model rather than a typewriter. */
function chunkText(text: string): string[] {
  return text.match(/\S+\s*/g) ?? []
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }

    const timer = setTimeout(resolve, ms)

    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }

    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError")
}
