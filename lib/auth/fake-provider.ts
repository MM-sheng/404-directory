import { normalizePhone } from "@/lib/auth/phone"
import { createId } from "@/lib/id"
import type { User } from "@/types/auth"

const REQUEST_LATENCY_MS = 420
const VERIFY_LATENCY_MS = 560

export class FakeAuthProvider {
  async requestPhoneCode(phone: string): Promise<void> {
    void phone
    await wait(REQUEST_LATENCY_MS)
  }

  async verifyPhoneCode(phone: string, code: string): Promise<User> {
    assertCode(code)
    await wait(VERIFY_LATENCY_MS)

    const normalized = normalizePhone(phone)

    return {
      id: createId(),
      method: "phone",
      phone: normalized,
      name: normalized,
    }
  }
}

function assertCode(code: string) {
  if (!/^\d{6}$/.test(code.trim())) {
    throw new Error("Enter the 6-digit code.")
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
