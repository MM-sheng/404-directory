"use client"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"

export function PrivacyBadge() {
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" />}
        className="text-muted-foreground motion-safe:transition-colors motion-safe:duration-300 hover:text-foreground"
      >
        Private
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PopoverHeader>
          <PopoverTitle>Session-local history</PopoverTitle>
          <PopoverDescription>
            Chat history is currently stored locally in this session. No server
            persistence is implemented.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  )
}
