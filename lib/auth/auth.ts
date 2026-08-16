import NextAuth from "next-auth"
import Apple from "next-auth/providers/apple"
import Google from "next-auth/providers/google"
import Resend from "next-auth/providers/resend"

import type { AuthMethod } from "@/types/auth"

function mapProvider(provider: string): AuthMethod {
  if (provider === "google") return "google"
  if (provider === "apple") return "apple"
  return "email"
}

function configuredProviders() {
  const providers = []

  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
      })
    )
  }

  if (process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET) {
    providers.push(
      Apple({
        clientId: process.env.AUTH_APPLE_ID,
        clientSecret: process.env.AUTH_APPLE_SECRET,
      })
    )
  }

  if (process.env.AUTH_RESEND_KEY && process.env.EMAIL_FROM) {
    providers.push(
      Resend({
        apiKey: process.env.AUTH_RESEND_KEY,
        from: process.env.EMAIL_FROM,
      })
    )
  }

  return providers
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: configuredProviders(),
  trustHost: true,
  callbacks: {
    jwt({ token, account }) {
      if (account?.provider) {
        token.authMethod = mapProvider(account.provider)
      }

      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? session.user.email ?? "user"
        session.user.authMethod = token.authMethod as AuthMethod | undefined
      }

      return session
    },
  },
})

export function isProviderConfigured(provider: "google" | "apple" | "email") {
  if (provider === "google") {
    return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)
  }

  if (provider === "apple") {
    return Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET)
  }

  return Boolean(process.env.AUTH_RESEND_KEY && process.env.EMAIL_FROM)
}
