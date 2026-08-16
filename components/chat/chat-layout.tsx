"use client"

import * as React from "react"

import { AccountSheet } from "@/components/auth/account-sheet"
import { AuthProvider } from "@/components/auth/auth-provider"
import { ChatHeader } from "@/components/chat/chat-header"
import { ChatProvider, useChat } from "@/components/chat/chat-provider"
import { Composer } from "@/components/chat/composer"
import { MessageList } from "@/components/chat/message-list"
import { SettingsSheet } from "@/components/chat/settings-sheet"
import { Sidebar } from "@/components/chat/sidebar"
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider"
import { WelcomeDialog } from "@/components/onboarding/welcome-dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { EnabledMethods } from "@/types/auth"

function useHasMounted() {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
}

export function ChatLayout({
  enabledMethods,
}: {
  enabledMethods: EnabledMethods
}) {
  const mounted = useHasMounted()

  if (!mounted) {
    return <div className="h-svh bg-background" />
  }

  return (
    <AuthProvider enabledMethods={enabledMethods}>
      <ChatProvider>
        <OnboardingProvider>
          <ChatShell />
        </OnboardingProvider>
      </ChatProvider>
    </AuthProvider>
  )
}

function ChatShell() {
  const { mobileSidebarOpen, setMobileSidebarOpen } = useChat()

  return (
    <div className="animate-fade flex h-svh overflow-hidden bg-background">
      <Sidebar className="hidden md:flex" />
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 sm:max-w-72" showCloseButton={false}>
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Chats and settings</SheetDescription>
          </SheetHeader>
          <Sidebar className="w-full border-r-0" forceExpanded />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader />
        <MessageList />
        <Composer />
      </div>
      <SettingsSheet />
      <AccountSheet />
      <WelcomeDialog />
    </div>
  )
}
