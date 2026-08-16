import { z } from "zod"
import {
  ActionTypeSchema,
  AgentPageModelSchema,
  PageTypeSchema,
  type AgentPageModel,
  type Evidence,
} from "../schemas/agent-page-model.js"
import type { PageSignals } from "../shared/signals.js"
import { compressSignalsForModel } from "./compress.js"

const LlmPatchSchema = z
  .object({
    page_type: PageTypeSchema.optional(),
    summary: z.string().min(1).max(2_000).optional(),
    entities: z
      .array(
        z
          .object({
            type: z.enum([
              "product",
              "article",
              "hotel",
              "job",
              "order",
              "organization",
              "person",
              "place",
              "other",
            ]),
            name: z.string().min(1).max(500),
            attributes: z.record(
              z.string(),
              z.union([z.string(), z.number(), z.boolean(), z.null()])
            ),
          })
          .strict()
      )
      .max(20)
      .optional(),
    state: z
      .object({
        login_status: z
          .enum(["authenticated", "anonymous", "unknown"])
          .optional(),
        properties: z
          .record(
            z.string(),
            z.union([z.string(), z.number(), z.boolean(), z.null()])
          )
          .optional(),
      })
      .strict()
      .optional(),
    actions: z
      .array(
        z
          .object({
            type: ActionTypeSchema,
            label: z.string().min(1).max(300),
            target: z.string().max(500).optional(),
            enabled: z.boolean(),
            required_inputs: z.array(z.string().max(200)).max(30),
          })
          .strict()
      )
      .max(40)
      .optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict()

export type LlmAnalyzerConfig = {
  enabled: boolean
  baseUrl: string
  apiKey?: string
  model: string
  timeoutMs: number
}

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const candidate = (fenced ?? text).trim()
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start < 0 || end <= start) {
    throw new Error("LLM response did not contain a JSON object")
  }
  return JSON.parse(candidate.slice(start, end + 1))
}

export class OptionalLlmAnalyzer {
  constructor(private readonly config: LlmAnalyzerConfig) {}

  get enabled(): boolean {
    return this.config.enabled && Boolean(this.config.apiKey)
  }

  async refine(
    signals: PageSignals,
    baseline: AgentPageModel
  ): Promise<AgentPageModel> {
    if (!this.enabled || !this.config.apiKey) return baseline

    const compressed = compressSignalsForModel(signals)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs)

    try {
      const response = await fetch(
        `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.config.model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "You refine AgentPageModel for ordinary human webpages. " +
                  "Use only the provided compressed signals. Never invent " +
                  "credentials, payment data, or clickable selectors. Return " +
                  "JSON only. Allowed actions: search, login, select_variant, " +
                  "add_to_cart, submit, download. Prefer correcting page_type, " +
                  "summary, entities, state, and missing actions.",
              },
              {
                role: "user",
                content: JSON.stringify({
                  baseline,
                  signals: compressed,
                }),
              },
            ],
          }),
        }
      )

      if (!response.ok) {
        throw new Error(`LLM request failed (${response.status})`)
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const content = payload.choices?.[0]?.message?.content
      if (!content) throw new Error("LLM returned empty content")

      const patch = LlmPatchSchema.parse(extractJsonObject(content))
      const evidence: Evidence[] = [
        ...baseline.evidence,
        {
          source: "llm",
          field: "refinement",
          raw_value: this.config.model,
        },
      ]

      return AgentPageModelSchema.parse({
        page_type: patch.page_type ?? baseline.page_type,
        summary: patch.summary ?? baseline.summary,
        entities: patch.entities ?? baseline.entities,
        state: {
          login_status:
            patch.state?.login_status ?? baseline.state.login_status,
          properties: {
            ...baseline.state.properties,
            ...(patch.state?.properties ?? {}),
          },
        },
        actions: patch.actions ?? baseline.actions,
        evidence: evidence.slice(0, 200),
        confidence: Math.min(
          0.98,
          Math.max(baseline.confidence, patch.confidence ?? baseline.confidence)
        ),
      })
    } finally {
      clearTimeout(timer)
    }
  }
}
