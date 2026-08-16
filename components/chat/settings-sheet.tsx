"use client"

import { useAuth } from "@/components/auth/auth-provider"
import { useOnboarding } from "@/components/onboarding/onboarding-provider"
import { accountLabel } from "@/lib/auth/display"
import { AdvancedSettings } from "@/components/chat/advanced-settings"
import { ThemeToggle } from "@/components/chat/theme-toggle"
import { useChat } from "@/components/chat/chat-provider"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export function SettingsSheet() {
  const { settingsOpen, setSettingsOpen } = useChat()
  const { session, isGuest, setAccountOpen } = useAuth()
  const { replayIntro } = useOnboarding()

  return (
    <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Appearance and local generation parameters.
          </SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-6">
          <FieldGroup>
            <Field>
              <FieldLabel>Theme</FieldLabel>
              <ThemeToggle />
            </Field>
            <Field>
              <FieldLabel>Account</FieldLabel>
              <FieldDescription>
                {isGuest
                  ? "Sign in with email, phone, Google, or Apple. Chat is not blocked."
                  : `Signed in as ${accountLabel(session.user)}.`}
              </FieldDescription>
              <Button
                type="button"
                variant="ghost"
                className="h-auto justify-start px-0 text-foreground"
                onClick={() => {
                  setSettingsOpen(false)
                  setAccountOpen(true)
                }}
              >
                {isGuest ? "Sign in" : "Manage account"}
              </Button>
            </Field>
            <Field>
              <FieldLabel>Privacy</FieldLabel>
              <FieldDescription>
                Chat is not gated. History still lives in this session until a
                real identity service is connected.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Introduction</FieldLabel>
              <FieldDescription>
                Show the first-run overview again.
              </FieldDescription>
              <Button
                type="button"
                variant="ghost"
                className="h-auto justify-start px-0 text-foreground"
                onClick={() => {
                  setSettingsOpen(false)
                  replayIntro()
                }}
              >
                Replay introduction
              </Button>
            </Field>
          </FieldGroup>
          <Separator className="my-6" />
          <AdvancedSettings />
        </div>
      </SheetContent>
    </Sheet>
  )
}
