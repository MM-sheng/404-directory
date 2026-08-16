"use client"

import { SignInForm } from "@/components/auth/sign-in-form"
import { useAuth } from "@/components/auth/auth-provider"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { accountLabel, methodLabel } from "@/lib/auth/display"

export function AccountSheet() {
  const { session, isGuest, isAuthenticating, accountOpen, setAccountOpen, signOut } =
    useAuth()

  return (
    <Sheet open={accountOpen} onOpenChange={setAccountOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isGuest ? "Sign in" : "Account"}</SheetTitle>
          <SheetDescription>
            {isGuest
              ? "Email, phone, Google, or Apple. Chat is not blocked."
              : "This session is signed in."}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {isGuest ? (
            <SignInForm />
          ) : (
            <div className="flex flex-col gap-5">
              <div>
                <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                  {session.user ? methodLabel(session.user.method) : "Signed in"}
                </p>
                <p className="mt-2 font-serif text-[1.2rem] leading-[1.65] tracking-[-0.01em]">
                  {accountLabel(session.user)}
                </p>
              </div>
              <p className="text-[15px] leading-[1.75] text-muted-foreground">
                Signed in with Auth.js. Chat history still lives in this session
                until a database is connected.
              </p>
              <Button
                type="button"
                variant="ghost"
                className="justify-start px-0 text-muted-foreground"
                disabled={isAuthenticating}
                onClick={() => void signOut()}
              >
                {isAuthenticating ? "Signing out" : "Sign out"}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
