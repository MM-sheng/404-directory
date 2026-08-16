import type {
  ToolCatalogEntry,
  ToolDefinition,
  ToolDiscoveryEntry,
} from "./types.js"
import { zodToJsonSchema } from "./json-schema.js"

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`)
    }
    this.tools.set(tool.name, tool)
    return this
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()]
  }

  listActive(): ToolDefinition[] {
    return this.list().filter((tool) => tool.status === "active")
  }

  discovery(): ToolDiscoveryEntry[] {
    return this.listActive().map((tool) => ({
      name: tool.name,
      description: tool.description,
      use_when: tool.use_when,
      href: `/tools/${tool.name}`,
    }))
  }

  catalog(): ToolCatalogEntry[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      use_when: tool.use_when,
      do_not_use_when: tool.do_not_use_when,
      version: tool.version,
      endpoint: tool.endpoint,
      method: tool.method,
      status: tool.status,
      read_only: tool.read_only,
      side_effects: tool.side_effects,
      requires_auth: tool.requires_auth,
      cost: tool.cost,
      typical_latency_ms: tool.typical_latency_ms,
      examples: tool.examples,
      input_schema: zodToJsonSchema(tool.inputSchema),
      output_schema: zodToJsonSchema(tool.outputSchema),
    }))
  }

  catalogEntry(name: string): ToolCatalogEntry | undefined {
    const tool = this.get(name)
    if (!tool) return undefined
    return {
      name: tool.name,
      description: tool.description,
      use_when: tool.use_when,
      do_not_use_when: tool.do_not_use_when,
      version: tool.version,
      endpoint: tool.endpoint,
      method: tool.method,
      status: tool.status,
      read_only: tool.read_only,
      side_effects: tool.side_effects,
      requires_auth: tool.requires_auth,
      cost: tool.cost,
      typical_latency_ms: tool.typical_latency_ms,
      examples: tool.examples,
      input_schema: zodToJsonSchema(tool.inputSchema),
      output_schema: zodToJsonSchema(tool.outputSchema),
    }
  }
}
