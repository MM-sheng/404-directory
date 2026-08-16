import type { AuthMethod, User } from "@/types/auth"

const METHOD_LABEL: Record<AuthMethod, string> = {
  email: "Email",
  phone: "Phone",
  google: "Google",
  apple: "Apple",
}

export function methodLabel(method: AuthMethod): string {
  return METHOD_LABEL[method]
}

export function accountLabel(user: User | null): string {
  if (!user) {
    return "Guest"
  }

  return user.email ?? user.phone ?? user.name
}
