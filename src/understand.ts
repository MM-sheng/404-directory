import { analyzePage } from "./analysis/analyze.js"
import { OptionalLlmAnalyzer } from "./analysis/llm.js"
import { PageCollector } from "./browser/collector.js"
import {
  AgentPageModelSchema,
  UnderstandRequestSchema,
  type AgentPageModel,
} from "./schemas/agent-page-model.js"

export type UnderstandWebpage = (url: string) => Promise<AgentPageModel>

export class UnderstandService {
  constructor(
    private readonly collector: PageCollector,
    private readonly timeoutMs: number,
    private readonly llm?: OptionalLlmAnalyzer
  ) {}

  async understand(url: string): Promise<AgentPageModel> {
    const input = UnderstandRequestSchema.parse({ url })
    let timer: NodeJS.Timeout | undefined

    try {
      const signals = await Promise.race([
        this.collector.collect(input.url),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error(`Page analysis exceeded ${this.timeoutMs}ms`)),
            this.timeoutMs
          )
        }),
      ])
      const baseline = AgentPageModelSchema.parse(analyzePage(signals))
      if (!this.llm?.enabled) return baseline

      try {
        return await this.llm.refine(signals, baseline)
      } catch {
        // Heuristic model remains the durable fallback when LLM refinement fails.
        return baseline
      }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}
