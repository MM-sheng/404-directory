"use client"

import { signIn, signOut, useSession } from "next-auth/react"
import * as React from "react"

import { FakeAuthProvider } from "@/lib/auth/fake-provider"
import { GUEST_SESSION, mapNextAuthSession } from "@/lib/auth/map-session"
import { isValidEmail, normalizeEmail } from "@/lib/auth/email"
import { isValidPhone, normalizePhone } from "@/lib/auth/phone"
import type { AuthSession, EnabledMethods, User } from "@/types/auth"

const phoneAuth = new FakeAuthProvider()

type AuthContextValue = {
  session: AuthSession
  isGuest: boolean
  isAuthenticating: boolean
  enabledMethods: EnabledMethods
  accountOpen: boolean
  setAccountOpen: (open: boolean) => void
  requestEmailLink: (email: string) => Promise<void>
  requestPhoneCode: (phone: string) => Promise<void>
  verifyPhoneCode: (phone: string, code: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithApple: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }

  return context
}

export function AuthProvider({
  enabledMethods,
  children,
}: {
  enabledMethods: EnabledMethods
  children: React.ReactNode
}) {
  const { data, status } = useSession()
  const [accountOpen, setAccountOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [phoneUser, setPhoneUser] = React.useState<User | null>(null)

  const session = React.useMemo(() => {
    if (phoneUser) {
      return { status: "signed-in" as const, user: phoneUser }
    }

    if (status === "authenticated") {
      return mapNextAuthSession(data)
    }

    return GUEST_SESSION
  }, [data, phoneUser, status])

  const isAuthenticating = pending || status === "loading"

  const run = React.useCallback(async (task: () => Promise<void>) => {
    setPending(true)

    try {
      await task()
    } finally {
      setPending(false)
    }
  }, [])

  const requestEmailLink = React.useCallback(
    async (email: string) => {
      if (!enabledMethods.email) {
        throw new Error(notConfigured("Email"))
      }

      const normalized = normalizeEmail(email)

      if (!isValidEmail(normalized)) {
        throw new Error("Enter a valid email address.")
      }

      await run(async () => {
        const result = await signIn("resend", {
          email: normalized,
          redirect: false,
        })

        if (result?.error) {
          throw new Error("Could not send the sign-in link. Try again.")
        }
      })
    },
    [enabledMethods.email, run]
  )

  const requestPhoneCode = React.useCallback(
    async (phone: string) => {
      const normalized = normalizePhone(phone)

      if (!isValidPhone(normalized)) {
        throw new Error("Enter a valid phone number.")
      }

      await run(async () => {
        await phoneAuth.requestPhoneCode(normalized)
      })
    },
    [run]
  )

  const verifyPhoneCode = React.useCallback(
    async (phone: string, code: string) => {
      await run(async () => {
        const user = await phoneAuth.verifyPhoneCode(normalizePhone(phone), code)
        setPhoneUser(user)
        setAccountOpen(false)
      })
    },
    [run]
  )

  // OAuth uses the normal full-page redirect. Never hand-navigate to the URL
  // Auth.js returns, because for an unregistered provider that URL is its
  // empty built-in sign-in page.
  const signInWithGoogle = React.useCallback(async () => {
    if (!enabledMethods.google) {
      throw new Error(notConfigured("Google"))
    }

    await run(() => signIn("google", { callbackUrl: "/" }))
  }, [enabledMethods.google, run])

  const signInWithApple = React.useCallback(async () => {
    if (!enabledMethods.apple) {
      throw new Error(notConfigured("Apple"))
    }

    await run(() => signIn("apple", { callbackUrl: "/" }))
  }, [enabledMethods.apple, run])

  const handleSignOut = React.useCallback(async () => {
    await run(async () => {
      setPhoneUser(null)
      await signOut({ redirect: false })
    })
  }, [run])

  const value = React.useMemo(
    () => ({
      session,
      isGuest: session.status === "guest",
      isAuthenticating,
      enabledMethods,
      accountOpen,
      setAccountOpen,
      requestEmailLink,
      requestPhoneCode,
      verifyPhoneCode,
      signInWithGoogle,
      signInWithApple,
      signOut: handleSignOut,
    }),
    [
      accountOpen,
      enabledMethods,
      handleSignOut,
      isAuthenticating,
      requestEmailLink,
      requestPhoneCode,
      session,
      signInWithApple,
      signInWithGoogle,
      verifyPhoneCode,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function notConfigured(label: string): string {
  return `${label} sign-in is not configured. Add its keys to .env.local and restart the dev server.`
}
