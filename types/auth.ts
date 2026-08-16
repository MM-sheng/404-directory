export type AuthStatus = "guest" | "signed-in"

export type AuthMethod = "email" | "phone" | "google" | "apple"

export interface User {
  id: string
  name: string
  method: AuthMethod
  email?: string
  phone?: string
}

export interface AuthSession {
  status: AuthStatus
  user: User | null
}

export type EnabledMethods = Record<AuthMethod, boolean>
