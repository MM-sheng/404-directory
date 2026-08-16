"use client"

import * as React from "react"

import { clearIntroSeen, hasSeenIntro, markIntroSeen } from "@/lib/onboarding"

type OnboardingContextValue = {
  introOpen: boolean
  openIntro: () => void
  closeIntro: () => void
  replayIntro: () => void
}

const OnboardingContext = React.createContext<OnboardingContextValue | null>(null)

export function useOnboarding(): OnboardingContextValue {
  const context = React.useContext(OnboardingContext)

  if (!context) {
    throw new Error("useOnboarding must be used within OnboardingProvider")
  }

  return context
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  // Safe to read storage during the initial render: this tree only mounts on
  // the client, after hydration.
  const [introOpen, setIntroOpen] = React.useState(() => !hasSeenIntro())

  const openIntro = React.useCallback(() => {
    setIntroOpen(true)
  }, [])

  const closeIntro = React.useCallback(() => {
    markIntroSeen()
    setIntroOpen(false)
  }, [])

  const replayIntro = React.useCallback(() => {
    clearIntroSeen()
    setIntroOpen(true)
  }, [])

  const value = React.useMemo(
    () => ({ introOpen, openIntro, closeIntro, replayIntro }),
    [closeIntro, introOpen, openIntro, replayIntro]
  )

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  )
}
