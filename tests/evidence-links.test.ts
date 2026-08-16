import { describe, expect, it } from "vitest"
import { linkPageModelEvidence } from "../src/evidence/link-page-model.js"
import { AgentPageModelSchema } from "../src/schemas/agent-page-model.js"

describe("AgentPageModel evidence links", () => {
  it("assigns stable evidence IDs and Claim -> Evidence references", () => {
    const linked = linkPageModelEvidence({
      page_type: "product",
      summary: "A product page",
      entities: [{ type: "product", name: "Widget", attributes: {} }],
      state: { login_status: "anonymous", properties: {} },
      actions: [
        {
          type: "add_to_cart",
          label: "Add Widget to cart",
          enabled: true,
          required_inputs: [],
        },
      ],
      evidence: [
        {
          source: "visible_text",
          field: "body",
          raw_value: "Widget",
        },
        {
          source: "control",
          label: "Add Widget to cart",
          raw_value: "button",
        },
      ],
      confidence: 0.9,
    })

    expect(() => AgentPageModelSchema.parse(linked)).not.toThrow()
    expect(linked.entities[0]?.evidence_ids).toContain("e1")
    expect(linked.actions[0]?.evidence_ids).toContain("e2")
    expect(linked.evidence[0]).toMatchObject({
      id: "e1",
      supports: expect.arrayContaining(["entities.0", "state"]),
    })
  })
})
