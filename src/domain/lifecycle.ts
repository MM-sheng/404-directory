import type { ToolStatus } from "./store.js"

export const DEGRADE_AFTER_FAILURES = 2
export const SUSPEND_AFTER_FAILURES = 4
export const RECOVER_AFTER_SUCCESSES = 2

/**
 * Lifecycle for catalog tools after a verification attempt.
 * Trust scores never substitute for this gate.
 */
export function nextLifecycleStatus(input: {
  current: ToolStatus
  admitted: boolean
  securityFail: boolean
  /** Fail count AFTER applying this attempt */
  failCount: number
  /** Success streak AFTER applying this attempt */
  successStreak: number
}): ToolStatus {
  if (input.securityFail) return "suspended"

  if (input.admitted) {
    if (input.current === "suspended") {
      return input.successStreak >= RECOVER_AFTER_SUCCESSES
        ? "active"
        : "suspended"
    }
    if (
      input.current === "pending" ||
      input.current === "degraded" ||
      input.current === "active"
    ) {
      return "active"
    }
    return input.current
  }

  // Not admitted
  if (input.current === "pending" || input.current === "deprecated") {
    return input.current
  }
  if (input.failCount >= SUSPEND_AFTER_FAILURES) return "suspended"
  if (
    input.current === "active" &&
    input.failCount >= DEGRADE_AFTER_FAILURES
  ) {
    return "degraded"
  }
  if (input.current === "degraded") return "degraded"
  if (input.current === "suspended") return "suspended"
  return input.current
}

/** Public discovery surfaces: active + degraded (ranked lower). */
export function isDiscoverableStatus(status: ToolStatus): boolean {
  return status === "active" || status === "degraded"
}
