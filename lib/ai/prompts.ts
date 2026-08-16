import type { ChatSettings, Message, Model, ModelKind } from "@/types/chat"

const KIND_SYSTEM: Record<ModelKind, string> = {
  general:
    "You are Private AI, a precise and restrained assistant. Prefer clear answers over filler.",
  reasoning:
    "You are Private AI in reasoning mode. Think carefully, surface assumptions, and explain the path to the answer.",
  coding:
    "You are Private AI in coding mode. Prefer correct, minimal code. Use markdown fences with language tags.",
}

export function buildSystemPrompt(
  model: Model,
  settings: ChatSettings
): string {
  const parts = [KIND_SYSTEM[model.kind]]

  if (settings.systemPrompt.trim()) {
    parts.push(settings.systemPrompt.trim())
  }

  if (settings.reasoning && model.kind !== "reasoning") {
    parts.push("Show brief intermediate reasoning before the final answer.")
  }

  return parts.join("\n\n")
}

export function toApiMessages(
  messages: Message[],
  model: Model,
  settings: ChatSettings
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const system = buildSystemPrompt(model, settings)
  const history = messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        message.content.trim().length > 0
    )
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }))

  return [{ role: "system", content: system }, ...history]
}
