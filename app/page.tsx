import { ChatLayout } from "@/components/chat/chat-layout"
import { isProviderConfigured } from "@/lib/auth/auth"
import type { EnabledMethods } from "@/types/auth"

export default function Page() {
  // Read on the server so the sign-in UI never offers a method that would
  // dead-end on the Auth.js fallback page.
  const enabledMethods: EnabledMethods = {
    google: isProviderConfigured("google"),
    apple: isProviderConfigured("apple"),
    email: isProviderConfigured("email"),
    phone: true,
  }

  return <ChatLayout enabledMethods={enabledMethods} />
}
