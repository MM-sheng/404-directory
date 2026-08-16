import type { Session } from "next-auth"

import type { AuthSession, AuthMethod, User } from "@/types/auth"

const GUEST_SESSION: AuthSession = {
  status: "guest",
  user: null,
}

export function mapNextAuthSession(session: Session | null): AuthSession {
  if (!session?.user?.email && !session?.user?.name) {
    return GUEST_SESSION
  }

  const user: User = {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "Account",
    method: session.user.authMethod ?? inferMethod(session),
    email: session.user.email ?? undefined,
  }

  return {
    status: "signed-in",
    user,
  }
}

function inferMethod(session: Session): AuthMethod {
  const email = session.user?.email ?? ""

  if (email.endsWith("@privaterelay.appleid.com")) {
    return "apple"
  }

  if (email.endsWith("@gmail.com")) {
    return "google"
  }

  return "email"
}

export { GUEST_SESSION }
