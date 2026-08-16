"use client"

import { MenuIcon } from "lucide-react"

import { ModelSelector } from "@/components/chat/model-selector"
import { PrivacyBadge } from "@/components/chat/privacy-badge"
import { useChat } from "@/components/chat/chat-provider"
import { Button } from "@/components/ui/button"

export function ChatHeader() {
  const { setMobileSidebarOpen } = useChat()

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 px-4 md:px-8">
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="Open sidebar"
      >
        <MenuIcon />
      </Button>
      <div className="min-w-0 flex-1">
        <ModelSelector />
      </div>
      <PrivacyBadge />
    </header>
  )
}
