"use client"

import * as React from "react"

import { aiProvider } from "@/lib/ai"
import {
  createEmptyChat,
  getModel,
  INITIAL_CHAT,
  titleFromPrompt,
} from "@/lib/chat/defaults"
import { createId } from "@/lib/id"
import type { Chat, ChatSettings, Message, Model } from "@/types/chat"

type ChatContextValue = {
  chats: Chat[]
  activeChat: Chat | null
  activeModel: Model
  isStreaming: boolean
  sidebarCollapsed: boolean
  mobileSidebarOpen: boolean
  settingsOpen: boolean
  createChat: () => void
  selectChat: (id: string) => void
  sendMessage: (content: string) => Promise<void>
  stopGeneration: () => void
  regenerate: () => Promise<void>
  setModel: (modelId: string) => void
  updateSettings: (settings: Partial<ChatSettings>) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setMobileSidebarOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
}

const ChatContext = React.createContext<ChatContextValue | null>(null)

export function useChat(): ChatContextValue {
  const context = React.useContext(ChatContext)

  if (!context) {
    throw new Error("useChat must be used within ChatProvider")
  }

  return context
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = React.useState<Chat[]>([INITIAL_CHAT])
  const [activeChatId, setActiveChatId] = React.useState(INITIAL_CHAT.id)
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const abortRef = React.useRef<AbortController | null>(null)

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null
  const activeModel = getModel(activeChat?.modelId ?? "")
  const isStreaming = Boolean(
    activeChat?.messages.some(
      (message) =>
        message.status === "pending" || message.status === "streaming"
    )
  )

  const ensureActiveChat = React.useCallback((): Chat => {
    const existing = chats.find((chat) => chat.id === activeChatId)

    if (existing) {
      return existing
    }

    const next = createEmptyChat()
    setChats((current) => [next, ...current])
    setActiveChatId(next.id)
    return next
  }, [activeChatId, chats])

  const createChat = React.useCallback(() => {
    const current = chats.find((chat) => chat.id === activeChatId)

    if (current && current.messages.length === 0) {
      setMobileSidebarOpen(false)
      return
    }

    const next = createEmptyChat()
    setChats((currentChats) => [next, ...currentChats])
    setActiveChatId(next.id)
    setMobileSidebarOpen(false)
  }, [activeChatId, chats])

  const selectChat = React.useCallback((id: string) => {
    setActiveChatId(id)
    setMobileSidebarOpen(false)
  }, [])

  const setModel = React.useCallback(
    (modelId: string) => {
      const chat = ensureActiveChat()

      setChats((current) =>
        current.map((item) =>
          item.id === chat.id
            ? { ...item, modelId, updatedAt: Date.now() }
            : item
        )
      )
    },
    [ensureActiveChat]
  )

  const updateSettings = React.useCallback(
    (settings: Partial<ChatSettings>) => {
      const chat = ensureActiveChat()

      setChats((current) =>
        current.map((item) =>
          item.id === chat.id
            ? {
                ...item,
                settings: { ...item.settings, ...settings },
                updatedAt: Date.now(),
              }
            : item
        )
      )
    },
    [ensureActiveChat]
  )

  const stopGeneration = React.useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const runStream = React.useCallback(
    async (chat: Chat, assistantId: string, messages: Message[]) => {
      abortRef.current?.abort()

      const controller = new AbortController()
      abortRef.current = controller

      setChats((current) =>
        current.map((item) =>
          item.id === chat.id
            ? patchMessage(item, assistantId, {
                status: "pending",
                content: "",
                error: undefined,
              })
            : item
        )
      )

      try {
        let assembled = ""

        for await (const chunk of aiProvider.streamChat({
          messages,
          model: getModel(chat.modelId),
          settings: chat.settings,
          signal: controller.signal,
        })) {
          assembled += chunk

          setChats((current) =>
            current.map((item) =>
              item.id === chat.id
                ? patchMessage(item, assistantId, {
                    content: assembled,
                    status: "streaming",
                  })
                : item
            )
          )
        }

        setChats((current) =>
          current.map((item) =>
            item.id === chat.id
              ? patchMessage(item, assistantId, {
                  content: assembled,
                  status: "complete",
                })
              : item
          )
        )
      } catch (error) {
        if (isAbortError(error)) {
          setChats((current) =>
            current.map((item) => {
              if (item.id !== chat.id) {
                return item
              }

              const assistant = item.messages.find(
                (message) => message.id === assistantId
              )

              return patchMessage(item, assistantId, {
                status: assistant?.content ? "complete" : "error",
                error: assistant?.content
                  ? undefined
                  : "Generation stopped before any tokens arrived.",
              })
            })
          )
          return
        }

        setChats((current) =>
          current.map((item) =>
            item.id === chat.id
              ? patchMessage(item, assistantId, {
                  status: "error",
                  error:
                    error instanceof Error
                      ? error.message
                      : "The response could not be completed.",
                })
              : item
          )
        )
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
      }
    },
    []
  )

  const sendMessage = React.useCallback(
    async (content: string) => {
      const trimmed = content.trim()

      if (!trimmed || isStreaming) {
        return
      }

      const chat = ensureActiveChat()
      const now = Date.now()
      const userMessage: Message = {
        id: createId(),
        role: "user",
        content: trimmed,
        createdAt: now,
      }
      const assistantMessage: Message = {
        id: createId(),
        role: "assistant",
        content: "",
        createdAt: now,
        status: "pending",
      }
      const nextMessages = [...chat.messages, userMessage, assistantMessage]
      const nextTitle =
        chat.messages.length === 0 ? titleFromPrompt(trimmed) : chat.title

      setChats((current) =>
        current.map((item) =>
          item.id === chat.id
            ? {
                ...item,
                title: nextTitle,
                messages: nextMessages,
                updatedAt: now,
              }
            : item
        )
      )

      await runStream(
        { ...chat, title: nextTitle, messages: nextMessages },
        assistantMessage.id,
        nextMessages.filter((message) => message.role !== "assistant" || message.id !== assistantMessage.id)
      )
    },
    [ensureActiveChat, isStreaming, runStream]
  )

  const regenerate = React.useCallback(async () => {
    if (!activeChat || isStreaming) {
      return
    }

    const lastAssistantIndex = [...activeChat.messages]
      .reverse()
      .findIndex((message) => message.role === "assistant")

    if (lastAssistantIndex === -1) {
      return
    }

    const assistantIndex = activeChat.messages.length - 1 - lastAssistantIndex
    const assistant = activeChat.messages[assistantIndex]
    const priorMessages = activeChat.messages.slice(0, assistantIndex)

    if (!priorMessages.some((message) => message.role === "user")) {
      return
    }

    await runStream(activeChat, assistant.id, priorMessages)
  }, [activeChat, isStreaming, runStream])

  const value = React.useMemo<ChatContextValue>(
    () => ({
      chats,
      activeChat,
      activeModel,
      isStreaming,
      sidebarCollapsed,
      mobileSidebarOpen,
      settingsOpen,
      createChat,
      selectChat,
      sendMessage,
      stopGeneration,
      regenerate,
      setModel,
      updateSettings,
      setSidebarCollapsed,
      setMobileSidebarOpen,
      setSettingsOpen,
    }),
    [
      activeChat,
      activeModel,
      chats,
      createChat,
      isStreaming,
      mobileSidebarOpen,
      regenerate,
      selectChat,
      sendMessage,
      setModel,
      settingsOpen,
      sidebarCollapsed,
      stopGeneration,
      updateSettings,
    ]
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

function patchMessage(
  chat: Chat,
  messageId: string,
  patch: Partial<Message>
): Chat {
  return {
    ...chat,
    updatedAt: Date.now(),
    messages: chat.messages.map((message) =>
      message.id === messageId ? { ...message, ...patch } : message
    ),
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}
