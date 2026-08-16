import type { ChatSettings, Message, Model } from "@/types/chat"

export interface StreamChatParams {
  messages: Message[]
  model: Model
  settings: ChatSettings
  signal?: AbortSignal
}

export interface AIProvider {
  streamChat(params: StreamChatParams): AsyncIterable<string>
}
