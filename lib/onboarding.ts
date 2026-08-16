const INTRO_SEEN_KEY = "privacy-ai-chat:intro-seen"

export function hasSeenIntro(): boolean {
  try {
    return window.localStorage.getItem(INTRO_SEEN_KEY) === "1"
  } catch {
    // Storage can be unavailable in private windows. Treat it as "seen" so the
    // dialog never reappears on every load.
    return true
  }
}

export function markIntroSeen(): void {
  try {
    window.localStorage.setItem(INTRO_SEEN_KEY, "1")
  } catch {
    // Ignore: the dialog simply shows again next session.
  }
}

export function clearIntroSeen(): void {
  try {
    window.localStorage.removeItem(INTRO_SEEN_KEY)
  } catch {
    // Ignore.
  }
}
