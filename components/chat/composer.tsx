"use client"

import { ArrowUpIcon, SquareIcon } from "lucide-react"
import * as React from "react"

import { useChat } from "@/components/chat/chat-provider"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export function Composer() {
  const { isStreaming, sendMessage, stopGeneration } = useChat()
  const [value, setValue] = React.useState("")
  const [focused, setFocused] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const canSend = value.trim().length > 0 && !isStreaming

  function submit() {
    const next = value
    setValue("")
    setSending(true)
    window.setTimeout(() => setSending(false), 450)
    void sendMessage(next)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) {
      return
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (canSend) {
        submit()
      }
    }
  }

  return (
    <div className="px-6 pb-8">
      <form
        className={cn(
          "mx-auto grid w-full max-w-3xl grid-cols-1 gap-1.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-0",
          sending && "animate-composer-send"
        )}
        onSubmit={(event) => {
          event.preventDefault()
          if (canSend) {
            submit()
          }
        }}
      >
        <p className="font-mono text-[10px] leading-6 tracking-[0.18em] text-muted-foreground/70 uppercase sm:pt-4">
          Message
        </p>
        <div
          className={cn(
            "composer-field flex items-end gap-3",
            focused && "composer-field-active"
          )}
        >
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Ask anything"
            rows={1}
            className="max-h-44 min-h-11 flex-1 resize-none rounded-none border-0 bg-transparent px-0 py-2.5 font-serif text-[1.05rem] leading-[1.6] shadow-none placeholder:font-sans placeholder:text-[15px] placeholder:text-muted-foreground/60 focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
          />
          {isStreaming ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="mb-2 text-muted-foreground"
              onClick={stopGeneration}
              aria-label="Stop generating"
            >
              <SquareIcon />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-sm"
              variant="ghost"
              disabled={!canSend}
              aria-label="Send"
              className={cn(
                "mb-2 motion-safe:transition-colors motion-safe:duration-300",
                canSend ? "text-foreground" : "text-muted-foreground/50"
              )}
            >
              <ArrowUpIcon />
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
