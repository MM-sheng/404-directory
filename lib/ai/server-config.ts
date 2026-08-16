import type { ModelKind } from "@/types/chat"

export type ServerModelConfig = {
  baseUrl: string
  apiKey: string | null
  modelId: string
}

export function getServerModelConfig(): ServerModelConfig {
  const baseUrl = (
    process.env.MODEL_BASE_URL ?? "https://api.openai.com/v1"
  ).replace(/\/$/, "")

  return {
    baseUrl,
    apiKey: process.env.MODEL_API_KEY?.trim() || null,
    modelId: process.env.MODEL_ID?.trim() || "gpt-4o-mini",
  }
}

export function resolveModelId(kind: ModelKind, fallback: string): string {
  if (kind === "reasoning" && process.env.MODEL_ID_REASONING?.trim()) {
    return process.env.MODEL_ID_REASONING.trim()
  }

  if (kind === "coding" && process.env.MODEL_ID_CODING?.trim()) {
    return process.env.MODEL_ID_CODING.trim()
  }

  if (kind === "general" && process.env.MODEL_ID_GENERAL?.trim()) {
    return process.env.MODEL_ID_GENERAL.trim()
  }

  return fallback
}

export function isLiveModelConfigured(): boolean {
  return Boolean(getServerModelConfig().apiKey)
}
