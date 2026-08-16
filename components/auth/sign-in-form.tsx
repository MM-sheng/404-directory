"use client"

import * as React from "react"

import { useAuth } from "@/components/auth/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isValidEmail } from "@/lib/auth/email"
import { isValidPhone } from "@/lib/auth/phone"
import { cn } from "@/lib/utils"

type Channel = "email" | "phone"
type Step = "identifier" | "email-sent" | "code"

const fieldClassName =
  "h-11 rounded-none border-0 border-b border-border bg-transparent px-0 shadow-none focus-visible:border-foreground focus-visible:ring-0 dark:bg-transparent"

export function SignInForm() {
  const {
    isAuthenticating,
    enabledMethods,
    requestEmailLink,
    requestPhoneCode,
    verifyPhoneCode,
    signInWithGoogle,
    signInWithApple,
  } = useAuth()
  const [channel, setChannel] = React.useState<Channel>(
    enabledMethods.email ? "email" : "phone"
  )
  const [step, setStep] = React.useState<Step>("identifier")
  const [identifier, setIdentifier] = React.useState("")
  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const channelEnabled =
    channel === "email" ? enabledMethods.email : enabledMethods.phone
  const identifierValid =
    channel === "email" ? isValidEmail(identifier) : isValidPhone(identifier)

  function resetChannel(next: Channel) {
    setChannel(next)
    setStep("identifier")
    setIdentifier("")
    setCode("")
    setError(null)
  }

  async function onIdentifier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    try {
      if (channel === "email") {
        await requestEmailLink(identifier)
        setStep("email-sent")
      } else {
        await requestPhoneCode(identifier)
        setStep("code")
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not continue.")
    }
  }

  async function onCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    try {
      await verifyPhoneCode(identifier, code)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify the code.")
    }
  }

  async function onSocial(action: () => Promise<void>) {
    setError(null)

    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[15px] leading-[1.75] text-muted-foreground">
        Chat works without an account. Sign in to keep this session.
      </p>
      <div className="flex flex-col gap-2">
        <SocialButton
          label="Continue with Google"
          enabled={enabledMethods.google}
          busy={isAuthenticating}
          onClick={() => void onSocial(signInWithGoogle)}
          mark={<GoogleMark />}
        />
        <SocialButton
          label="Continue with Apple"
          enabled={enabledMethods.apple}
          busy={isAuthenticating}
          onClick={() => void onSocial(signInWithApple)}
          mark={<AppleMark />}
        />
      </div>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          Or
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="flex gap-4">
        <ChannelButton
          active={channel === "email"}
          onClick={() => resetChannel("email")}
        >
          Email
        </ChannelButton>
        <ChannelButton
          active={channel === "phone"}
          onClick={() => resetChannel("phone")}
        >
          Phone
        </ChannelButton>
      </div>
      {step === "email-sent" ? (
        <div className="flex flex-col gap-5">
          <p className="text-[15px] leading-[1.75] text-muted-foreground">
            A sign-in link was sent to{" "}
            <span className="text-foreground">{identifier}</span>. Open it in
            this browser to finish signing in.
          </p>
          <Button
            type="button"
            variant="ghost"
            className="justify-start px-0 text-muted-foreground"
            onClick={() => {
              setStep("identifier")
              setError(null)
            }}
          >
            Use a different email
          </Button>
        </div>
      ) : step === "identifier" ? (
        <form className="flex flex-col gap-5" onSubmit={onIdentifier}>
          <Field
            id="sign-in-identifier"
            label={channel === "email" ? "Email" : "Phone"}
            type={channel === "email" ? "email" : "tel"}
            autoComplete={channel === "email" ? "email" : "tel"}
            value={identifier}
            disabled={!channelEnabled}
            placeholder={channel === "email" ? "you@domain.com" : "+1 555 0100"}
            onChange={(value) => {
              setIdentifier(value)
              setError(null)
            }}
          />
          <Hint>
            {channel === "email"
              ? enabledMethods.email
                ? "You will get a sign-in link by email."
                : "Email sign-in needs AUTH_RESEND_KEY and EMAIL_FROM in .env.local."
              : "Phone is preview-only. Any 6 digits will sign you in until SMS is connected."}
          </Hint>
          {error ? <Hint>{error}</Hint> : null}
          <Button
            type="submit"
            disabled={!channelEnabled || !identifierValid || isAuthenticating}
          >
            {isAuthenticating
              ? channel === "email"
                ? "Sending link"
                : "Sending code"
              : "Continue"}
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-5" onSubmit={onCode}>
          <Hint>Enter the 6-digit preview code for {identifier}.</Hint>
          <Field
            id="sign-in-code"
            label="Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            placeholder="000000"
            maxLength={6}
            onChange={(value) => {
              setCode(value.replace(/\D/g, "").slice(0, 6))
              setError(null)
            }}
          />
          {error ? <Hint>{error}</Hint> : null}
          <Button type="submit" disabled={code.length !== 6 || isAuthenticating}>
            {isAuthenticating ? "Verifying" : "Sign in"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="justify-start px-0 text-muted-foreground"
            disabled={isAuthenticating}
            onClick={() => {
              setStep("identifier")
              setCode("")
              setError(null)
            }}
          >
            Use a different phone
          </Button>
        </form>
      )}
    </div>
  )
}

function SocialButton({
  label,
  enabled,
  busy,
  onClick,
  mark,
}: {
  label: string
  enabled: boolean
  busy: boolean
  onClick: () => void
  mark: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant="outline"
        className="h-11 justify-start gap-3 rounded-lg"
        disabled={!enabled || busy}
        onClick={onClick}
      >
        {mark}
        {label}
      </Button>
      {enabled ? null : (
        <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/70 uppercase">
          Not configured
        </p>
      )}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-6 text-muted-foreground">{children}</p>
}

function Field({
  id,
  label,
  value,
  onChange,
  ...props
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  return (
    <div className="flex flex-col gap-2">
      <Label
        htmlFor={id}
        className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase"
      >
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClassName}
        {...props}
      />
    </div>
  )
}

function ChannelButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "font-mono text-[10px] tracking-[0.18em] uppercase motion-safe:transition-colors motion-safe:duration-300",
        active ? "text-foreground" : "text-muted-foreground/70"
      )}
    >
      {children}
    </button>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="currentColor"
        d="M21.6 12.23c0-.74-.07-1.45-.19-2.13H12v4.03h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.42Z"
      />
      <path
        fill="currentColor"
        d="M12 22c2.7 0 4.97-.9 6.63-2.35l-3.24-2.5c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.58A9.99 9.99 0 0 0 12 22Z"
        opacity=".72"
      />
      <path
        fill="currentColor"
        d="M6.41 13.99A6 6 0 0 1 6.1 12c0-.69.12-1.36.3-1.99V7.43H3.07A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.57l3.34-2.58Z"
        opacity=".56"
      />
      <path
        fill="currentColor"
        d="M12 5.89c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.96 2.89 14.7 2 12 2A9.99 9.99 0 0 0 3.07 7.43l3.34 2.58C7.2 7.65 9.4 5.89 12 5.89Z"
        opacity=".4"
      />
    </svg>
  )
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="currentColor"
        d="M16.7 12.55c0-2.16 1.77-3.2 1.85-3.25-1.01-1.48-2.58-1.68-3.14-1.7-1.34-.14-2.61.79-3.29.79s-1.72-.77-2.83-.75c-1.46.02-2.8.85-3.55 2.15-1.51 2.62-.39 6.5 1.09 8.63.72 1.04 1.58 2.21 2.71 2.17 1.09-.04 1.5-.7 2.81-.7s1.68.7 2.83.68c1.17-.02 1.91-1.06 2.63-2.11.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.28-.87-2.3-3.47ZM14.86 6.4c.6-.73 1-1.74.89-2.75-.86.03-1.9.57-2.52 1.3-.55.64-1.04 1.67-.91 2.65.96.07 1.94-.49 2.54-1.2Z"
      />
    </svg>
  )
}
