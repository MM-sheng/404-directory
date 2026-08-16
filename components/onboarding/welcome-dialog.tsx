"use client"

import { useOnboarding } from "@/components/onboarding/onboarding-provider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

const POINTS = [
  {
    title: "Private by default",
    body: "History lives in this browser session. Nothing is written to a server.",
  },
  {
    title: "No account required",
    body: "Chat as a guest. Sign in only when you want to keep a session.",
  },
  {
    title: "Yours to tune",
    body: "Switch model kind in the header. Adjust the system prompt and sampling in Settings.",
  },
]

export function WelcomeDialog() {
  const { introOpen, closeIntro } = useOnboarding()

  return (
    <Dialog
      open={introOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeIntro()
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="gap-0 rounded-xl p-0 sm:max-w-lg"
      >
        <div className="px-7 pt-7 pb-6">
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/70 uppercase">
            First run
          </p>
          <DialogTitle className="mt-3 font-serif text-[2rem] leading-[1.15] font-normal tracking-[-0.03em]">
            Private AI
          </DialogTitle>
        </div>
        <div className="flex flex-col">
          {POINTS.map((point, index) => (
            <div
              key={point.title}
              className="animate-rise grid grid-cols-[2.5rem_minmax(0,1fr)] gap-0 border-t border-border/70 px-7 py-5"
              style={{ animationDelay: `${120 + index * 90}ms` }}
            >
              <p className="font-mono text-[10px] leading-6 tracking-[0.18em] text-muted-foreground/70">
                {String(index + 1).padStart(2, "0")}
              </p>
              <div className="min-w-0">
                <p className="text-[15px] leading-6">{point.title}</p>
                <p className="mt-1 text-[15px] leading-[1.75] text-muted-foreground">
                  {point.body}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border/70 px-7 py-5">
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/70 uppercase">
            Enter to send
          </p>
          <Button type="button" onClick={closeIntro}>
            Start
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
