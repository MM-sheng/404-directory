"use client"

import { useChat } from "@/components/chat/chat-provider"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DEFAULT_MODEL_ID, MODELS, MODEL_KIND_LABEL } from "@/lib/chat/defaults"

const items = MODELS.map((model) => ({
  value: model.id,
  label: MODEL_KIND_LABEL[model.kind],
}))

export function ModelSelector() {
  const { activeChat, activeModel, setModel } = useChat()

  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <p className="truncate text-sm text-foreground">{activeModel.name}</p>
      <Select
        items={items}
        value={activeChat?.modelId ?? DEFAULT_MODEL_ID}
        onValueChange={(value) => {
          if (typeof value === "string") {
            setModel(value)
          }
        }}
      >
        <SelectTrigger
          size="sm"
          className="h-auto min-w-0 border-0 bg-transparent px-0 py-0 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} side="bottom">
          <SelectGroup>
            {MODELS.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {MODEL_KIND_LABEL[model.kind]}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
