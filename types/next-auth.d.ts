import type { DefaultSession } from "next-auth"

import type { AuthMethod } from "@/types/auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      authMethod?: AuthMethod
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    authMethod?: AuthMethod
  }
}
