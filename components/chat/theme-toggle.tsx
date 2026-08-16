"use client"

import { useTheme } from "next-themes"
import * as React from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const

function useHasMounted() {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useHasMounted()

  if (!mounted) {
    return <div className="h-7" />
  }

  return (
    <ToggleGroup
      value={[theme ?? "system"]}
      onValueChange={(value) => {
        const next = value[0]
        if (next) {
          setTheme(next)
        }
      }}
      spacing={0}
      size="sm"
      className="w-full"
    >
      {THEMES.map((item) => (
        <ToggleGroupItem
          key={item.value}
          value={item.value}
          className="flex-1"
        >
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
