import type { z } from "zod"

export type ToolStatus = "active" | "deprecated" | "disabled"

export type ToolHttpMethod = "GET" | "POST"

export type ToolExample = {
  description: string
  input: unknown
  output: unknown
}

export type ToolDefinition<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
> = {
  name: string
  description: string
  use_when: string
  do_not_use_when: string
  version: string
  endpoint: string
  method: ToolHttpMethod
  status: ToolStatus
  read_only: boolean
  side_effects: string[]
  requires_auth: boolean
  cost: "free" | string
  typical_latency_ms: number
  examples: ToolExample[]
  inputSchema: TInput
  outputSchema: TOutput
  handler: (input: z.infer<TInput>) => Promise<z.infer<TOutput>>
  mcp?: {
    title?: string
    annotations?: {
      readOnlyHint?: boolean
      destructiveHint?: boolean
      idempotentHint?: boolean
      openWorldHint?: boolean
    }
  }
}

export type ToolCatalogEntry = {
  name: string
  description: string
  use_when: string
  do_not_use_when: string
  version: string
  endpoint: string
  method: ToolHttpMethod
  status: ToolStatus
  read_only: boolean
  side_effects: string[]
  requires_auth: boolean
  cost: "free" | string
  typical_latency_ms: number
  examples: ToolExample[]
  input_schema: Record<string, unknown>
  output_schema: Record<string, unknown>
}

export type ToolDiscoveryEntry = Pick<
  ToolDefinition,
  "name" | "description" | "use_when"
> & {
  href: string
}
