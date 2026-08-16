"use client"

import { CopyIcon, RefreshCwIcon } from "lucide-react"
import type { ReactNode } from "react"
import { toast } from "sonner"

import { Markdown } from "@/components/chat/markdown"
import { useChat } from "@/components/chat/chat-provider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Message as ChatMessage } from "@/types/chat"

export function Message({
  message,
  isLastAssistant,
}: {
  message: ChatMessage
  isLastAssistant: boolean
}) {
  const { activeModel, isStreaming, regenerate } = useChat()
  const isUser = message.role === "user"
  const isPending = message.status === "pending" && !message.content
  const isStreamingMessage = message.status === "streaming"
  const isError = message.status === "error"

  async function copy() {
    await navigator.clipboard.writeText(message.content)
    toast.success("Copied")
  }

  if (isUser) {
    return (
      <Turn label="You">
        <p className="font-serif text-[1.2rem] leading-[1.65] tracking-[-0.01em] whitespace-pre-wrap">
          {message.content}
        </p>
      </Turn>
    )
  }

  return (
    <Turn label={activeModel.name} active={isPending || isStreamingMessage}>
      {isPending ? (
        <div className="flex h-6 items-center gap-3" aria-label="Thinking">
          <p className="font-mono text-[11px] leading-none tracking-[0.22em] text-muted-foreground uppercase">
            Thinking
          </p>
          <span className="write-meter" />
        </div>
      ) : (
        <div className={cn(isError && "text-muted-foreground")}>
          {message.content ? (
            <Markdown content={message.content} streaming={isStreamingMessage} />
          ) : null}
          {isStreamingMessage ? <span className="write-head" /> : null}
          {isError ? (
            <p className="text-[15px] leading-[1.75]">
              {message.error ?? "The response could not be completed."}
            </p>
          ) : null}
        </div>
      )}
      {!isStreamingMessage && (message.content || (isError && isLastAssistant)) ? (
        <div className="mt-4 -ml-1.5 flex items-center gap-0.5 text-muted-foreground opacity-0 motion-safe:transition-opacity motion-safe:duration-300 group-hover/turn:opacity-100 focus-within:opacity-100">
          {message.content ? (
            <Button variant="ghost" size="icon-xs" onClick={copy} aria-label="Copy">
              <CopyIcon />
            </Button>
          ) : null}
          {isLastAssistant && !isStreaming ? (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => void regenerate()}
              aria-label="Regenerate"
            >
              <RefreshCwIcon />
            </Button>
          ) : null}
        </div>
      ) : null}
    </Turn>
  )
}

function Turn({
  label,
  active = false,
  children,
}: {
  label: string
  active?: boolean
  children: ReactNode
}) {
  return (
    <article className="animate-rise group/turn grid grid-cols-1 gap-1.5 border-t border-border/70 pt-7 pb-1 first:border-t-0 first:pt-0 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-0">
      <div className="sm:pt-0.5 sm:pr-6">
        <p
          className={cn(
            "font-mono text-[10px] leading-6 tracking-[0.18em] uppercase motion-safe:transition-colors motion-safe:duration-500",
            active ? "text-foreground" : "text-muted-foreground/70"
          )}
        >
          {label}
        </p>
        {active ? <span className="signal-line mt-1.5 block w-16 sm:w-auto" /> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </article>
  )
}
