export type Role = "user" | "assistant" | "system"

export type MessageStatus = "pending" | "streaming" | "complete" | "error"

export interface Message {
  id: string
  role: Role
  content: string
  createdAt: number
  status?: MessageStatus
  error?: string
}

export type ModelKind = "general" | "reasoning" | "coding"

export interface Model {
  id: string
  name: string
  kind: ModelKind
  description: string
}

export interface ChatSettings {
  systemPrompt: string
  temperature: number
  topP: number
  maxOutputTokens: number
  reasoning: boolean
}

export interface Chat {
  id: string
  title: string
  messages: Message[]
  modelId: string
  settings: ChatSettings
  createdAt: number
  updatedAt: number
}
