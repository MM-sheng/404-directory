"use client"

import { UserRoundIcon } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { Button } from "@/components/ui/button"
import { accountLabel } from "@/lib/auth/display"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function AccountButton({ collapsed = false }: { collapsed?: boolean }) {
  const { session, isGuest, setAccountOpen } = useAuth()
  const label = isGuest ? "Sign in" : accountLabel(session.user)

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={<Button variant="ghost" size="icon-sm" />}
          onClick={() => setAccountOpen(true)}
          aria-label={label}
        >
          <UserRoundIcon />
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Button
      variant="ghost"
      className="w-full justify-start text-muted-foreground motion-safe:transition-colors motion-safe:duration-300"
      onClick={() => setAccountOpen(true)}
    >
      <UserRoundIcon data-icon="inline-start" />
      <span className="min-w-0 truncate">{label}</span>
    </Button>
  )
}
