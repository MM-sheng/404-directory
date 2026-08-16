import { afterEach, describe, expect, it, vi } from "vitest"
import { OptionalLlmAnalyzer } from "../src/analysis/llm.js"
import type { AgentPageModel } from "../src/schemas/agent-page-model.js"
import type { PageSignals } from "../src/shared/signals.js"

const baseline: AgentPageModel = {
  page_type: "other",
  summary: "Baseline summary",
  entities: [],
  state: { login_status: "unknown", properties: {} },
  actions: [],
  evidence: [{ source: "title", field: "title", raw_value: "Demo" }],
  confidence: 0.4,
}

const signals: PageSignals = {
  requestedUrl: "https://shop.example/p/1",
  finalUrl: "https://shop.example/p/1",
  title: "Demo Camera",
  meta: [],
  visibleText: "Demo Camera $99 Add to cart",
  semanticDom: [],
  accessibility: '- button "Add to cart"',
  jsonLd: [],
  forms: [],
  buttons: [{ role: "button", label: "Add to cart", disabled: false }],
  links: [],
}

describe("OptionalLlmAnalyzer", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("is disabled without an API key", () => {
    const analyzer = new OptionalLlmAnalyzer({
      enabled: true,
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      timeoutMs: 1_000,
    })
    expect(analyzer.enabled).toBe(false)
  })

  it("merges a validated LLM patch into the baseline model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  page_type: "product",
                  summary: "Demo Camera product page",
                  actions: [
                    {
                      type: "add_to_cart",
                      label: "Add to cart",
                      enabled: true,
                      required_inputs: [],
                    },
                  ],
                  confidence: 0.9,
                }),
              },
            },
          ],
        }),
      }))
    )

    const analyzer = new OptionalLlmAnalyzer({
      enabled: true,
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-4o-mini",
      timeoutMs: 1_000,
    })

    const refined = await analyzer.refine(signals, baseline)
    expect(refined.page_type).toBe("product")
    expect(refined.actions[0]?.type).toBe("add_to_cart")
    expect(refined.evidence).toContainEqual({
      source: "llm",
      field: "refinement",
      raw_value: "gpt-4o-mini",
    })
  })
})
