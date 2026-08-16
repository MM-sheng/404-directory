import type { Chat, ChatSettings, Model } from "@/types/chat"
import { createId } from "@/lib/id"

export const MODELS: Model[] = [
  {
    id: "private-general",
    name: "Private AI",
    kind: "general",
    description: "Balanced replies for everyday work.",
  },
  {
    id: "private-reasoning",
    name: "Private AI",
    kind: "reasoning",
    description: "Slower, more deliberate answers.",
  },
  {
    id: "private-coding",
    name: "Private AI",
    kind: "coding",
    description: "Focused on code and technical tasks.",
  },
]

export const DEFAULT_MODEL_ID = "private-general"

export const DEFAULT_SETTINGS: ChatSettings = {
  systemPrompt: "",
  temperature: 0.7,
  topP: 1,
  maxOutputTokens: 2048,
  reasoning: false,
}

export const MODEL_KIND_LABEL: Record<Model["kind"], string> = {
  general: "General",
  reasoning: "Reasoning",
  coding: "Coding",
}

export function getModel(modelId: string): Model {
  return MODELS.find((model) => model.id === modelId) ?? MODELS[0]
}

export const INITIAL_CHAT: Chat = {
  id: "initial",
  title: "New chat",
  messages: [],
  modelId: DEFAULT_MODEL_ID,
  settings: { ...DEFAULT_SETTINGS },
  createdAt: 0,
  updatedAt: 0,
}

export function createEmptyChat(): Chat {
  const now = Date.now()

  return {
    id: createId(),
    title: "New chat",
    messages: [],
    modelId: DEFAULT_MODEL_ID,
    settings: { ...DEFAULT_SETTINGS },
    createdAt: now,
    updatedAt: now,
  }
}

export function titleFromPrompt(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim()

  if (!compact) {
    return "New chat"
  }

  return compact.length > 42 ? `${compact.slice(0, 42)}…` : compact
}
