"use client"

import * as React from "react"

import { Message } from "@/components/chat/message"
import { useChat } from "@/components/chat/chat-provider"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Message as ChatMessage } from "@/types/chat"

const EMPTY_MESSAGES: ChatMessage[] = []

export function MessageList() {
  const { activeChat } = useChat()
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const messages = activeChat?.messages ?? EMPTY_MESSAGES
  const lastAssistantId = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.id

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center px-6">
        <div className="animate-rise mx-auto grid w-full max-w-3xl grid-cols-1 gap-1.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-0">
          <p className="font-mono text-[10px] leading-6 tracking-[0.18em] text-muted-foreground/70 uppercase sm:pt-3">
            New session
          </p>
          <h1 className="font-serif text-[2.4rem] leading-[1.15] tracking-[-0.03em]">
            How can I help?
          </h1>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-6 py-12">
        {messages
          .filter((message) => message.role !== "system")
          .map((message) => (
            <Message
              key={message.id}
              message={message}
              isLastAssistant={message.id === lastAssistantId}
            />
          ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
