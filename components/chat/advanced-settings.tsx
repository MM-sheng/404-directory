"use client"

import { useChat } from "@/components/chat/chat-provider"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

export function AdvancedSettings() {
  const { activeChat, updateSettings } = useChat()
  const settings = activeChat?.settings

  if (!settings) {
    return null
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="system-prompt">System prompt</FieldLabel>
        <Textarea
          id="system-prompt"
          value={settings.systemPrompt}
          onChange={(event) =>
            updateSettings({ systemPrompt: event.target.value })
          }
          placeholder="Optional instructions for the model"
          className="min-h-28"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="temperature">
          Temperature
          <span className="ml-auto font-mono text-muted-foreground">
            {settings.temperature.toFixed(1)}
          </span>
        </FieldLabel>
        <Slider
          id="temperature"
          min={0}
          max={2}
          step={0.1}
          value={settings.temperature}
          onValueChange={(value) =>
            updateSettings({ temperature: Number(value) })
          }
        />
        <FieldDescription>Higher values increase variation.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="top-p">
          Top P
          <span className="ml-auto font-mono text-muted-foreground">
            {settings.topP.toFixed(2)}
          </span>
        </FieldLabel>
        <Slider
          id="top-p"
          min={0}
          max={1}
          step={0.05}
          value={settings.topP}
          onValueChange={(value) => updateSettings({ topP: Number(value) })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="max-tokens">
          Max output tokens
          <span className="ml-auto font-mono text-muted-foreground">
            {settings.maxOutputTokens}
          </span>
        </FieldLabel>
        <Slider
          id="max-tokens"
          min={256}
          max={8192}
          step={256}
          value={settings.maxOutputTokens}
          onValueChange={(value) =>
            updateSettings({ maxOutputTokens: Number(value) })
          }
        />
      </Field>
      <Field orientation="horizontal">
        <FieldLabel htmlFor="reasoning">Reasoning</FieldLabel>
        <Switch
          id="reasoning"
          checked={settings.reasoning}
          onCheckedChange={(checked) => updateSettings({ reasoning: checked })}
        />
      </Field>
    </FieldGroup>
  )
}
