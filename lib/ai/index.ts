import { ApiChatProvider } from "@/lib/ai/http-provider"
import type { AIProvider } from "@/lib/ai/provider"

// Browser entry point. Talks to POST /api/chat — keys stay on the server.
export const aiProvider: AIProvider = new ApiChatProvider()
