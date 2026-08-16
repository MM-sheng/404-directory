"use client"

import { PanelLeftIcon, PlusIcon, SettingsIcon } from "lucide-react"
import type { ReactNode } from "react"

import { AccountButton } from "@/components/auth/account-button"
import { useChat } from "@/components/chat/chat-provider"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function Sidebar({
  className,
  forceExpanded = false,
}: {
  className?: string
  forceExpanded?: boolean
}) {
  const {
    chats,
    activeChat,
    sidebarCollapsed,
    createChat,
    selectChat,
    setSidebarCollapsed,
    setSettingsOpen,
  } = useChat()

  const collapsed = forceExpanded ? false : sidebarCollapsed
  const history = chats.filter((chat) => chat.messages.length > 0)

  return (
    <aside
      className={cn(
        "flex h-full flex-col overflow-hidden border-r border-border bg-sidebar text-sidebar-foreground motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-[var(--ease-silk)]",
        collapsed ? "w-14" : "w-60",
        className
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center gap-2 px-3",
          collapsed && "justify-center px-2"
        )}
      >
        {collapsed ? (
          <SidebarIconButton
            label="Expand sidebar"
            onClick={() => setSidebarCollapsed(false)}
          >
            <PanelLeftIcon />
          </SidebarIconButton>
        ) : (
          <>
            <p className="min-w-0 flex-1 truncate text-[13px] tracking-[0.04em]">
              Private AI
            </p>
            {forceExpanded ? null : (
              <SidebarIconButton
                label="Collapse sidebar"
                onClick={() => setSidebarCollapsed(true)}
              >
                <PanelLeftIcon />
              </SidebarIconButton>
            )}
          </>
        )}
      </div>
      <div className={cn("px-2.5", collapsed && "px-2")}>
        {collapsed ? (
          <SidebarIconButton label="New chat" onClick={createChat}>
            <PlusIcon />
          </SidebarIconButton>
        ) : (
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground motion-safe:transition-colors motion-safe:duration-300"
            onClick={createChat}
          >
            <PlusIcon data-icon="inline-start" />
            New chat
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 pt-4">
        {collapsed ? null : (
          <ScrollArea className="h-full px-2.5">
            {history.length === 0 ? null : (
              <div className="flex flex-col gap-0.5 pb-3">
                {history.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => selectChat(chat.id)}
                    className={cn(
                      "rounded-lg px-2.5 py-2 text-left text-[13px] text-muted-foreground motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-[var(--ease-silk)] hover:bg-sidebar-accent hover:text-foreground",
                      chat.id === activeChat?.id &&
                        "bg-sidebar-accent text-foreground"
                    )}
                  >
                    <span className="line-clamp-1">{chat.title}</span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </div>
      <div className={cn("flex flex-col gap-0.5 p-2.5", collapsed && "p-2")}>
        <AccountButton collapsed={collapsed} />
        {collapsed ? (
          <SidebarIconButton
            label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
          </SidebarIconButton>
        ) : (
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground motion-safe:transition-colors motion-safe:duration-300"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon data-icon="inline-start" />
            Settings
          </Button>
        )}
      </div>
    </aside>
  )
}

function SidebarIconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-sm" />}
        onClick={onClick}
        aria-label={label}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
