import { describe, expect, it } from "vitest"
import { analyzePage } from "../src/analysis/analyze.js"
import { compressSignalsForModel } from "../src/analysis/compress.js"
import { AgentPageModelSchema } from "../src/schemas/agent-page-model.js"
import type { PageSignals } from "../src/shared/signals.js"

const productSignals: PageSignals = {
  requestedUrl: "https://shop.example/product/1",
  finalUrl: "https://shop.example/product/1",
  title: "Example Camera",
  meta: [{ name: "description", content: "A compact camera for travel." }],
  visibleText: "Example Camera $199 In stock Cart 2 Add to cart",
  semanticDom: [{ tag: "main", text: "Example Camera" }],
  accessibility: '- button "Add to cart"\n- link "Cart 2"',
  wait: { network_idle: true, content_stable: true, waited_ms: 900 },
  jsonLd: [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Example Camera",
      sku: "CAM-1",
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "179",
        highPrice: "199",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
    },
  ],
  forms: [
    {
      method: "POST",
      controls: [
        {
          kind: "select",
          name: "color",
          label: "Color",
          options: ["Black", "Silver"],
          selected_options: ["Black"],
          required: true,
          disabled: false,
        },
      ],
    },
  ],
  buttons: [
    { role: "button", label: "Add to cart", disabled: false },
    { role: "button", label: "Size M", disabled: false },
  ],
  links: [{ role: "link", label: "Cart 2", href: "/cart" }],
}

const loginSignals: PageSignals = {
  requestedUrl: "https://app.example/login",
  finalUrl: "https://app.example/login",
  title: "Sign in",
  meta: [],
  visibleText: "Sign in to continue",
  semanticDom: [{ tag: "form", text: "Sign in" }],
  accessibility: '- textbox "Email"\n- textbox "Password"\n- button "Log in"',
  jsonLd: [],
  forms: [
    {
      method: "POST",
      action: "/session",
      label: "Sign in",
      controls: [
        {
          kind: "input",
          type: "email",
          name: "email",
          label: "Email",
          required: true,
          disabled: false,
        },
        {
          kind: "input",
          type: "password",
          name: "password",
          label: "Password",
          required: true,
          disabled: false,
        },
      ],
    },
  ],
  buttons: [{ role: "button", label: "Log in", disabled: false }],
  links: [],
}

const jobSignals: PageSignals = {
  requestedUrl: "https://careers.example/jobs/42",
  finalUrl: "https://careers.example/jobs/42",
  title: "Staff Engineer",
  meta: [],
  visibleText: "Staff Engineer Remote Apply now Download PDF",
  semanticDom: [{ tag: "article", text: "Staff Engineer" }],
  accessibility: '- button "Apply now"\n- link "Download PDF"',
  jsonLd: [
    {
      "@type": "JobPosting",
      name: "Staff Engineer",
      employmentType: "FULL_TIME",
      hiringOrganization: { name: "404.directory" },
    },
  ],
  forms: [],
  buttons: [{ role: "button", label: "Apply now", disabled: false }],
  links: [
    {
      role: "link",
      label: "Download PDF",
      href: "https://careers.example/jobs/42.pdf",
    },
  ],
}

describe("analyzePage", () => {
  it("builds a schema-valid evidence-backed product model", () => {
    const model = analyzePage(productSignals)

    expect(() => AgentPageModelSchema.parse(model)).not.toThrow()
    expect(model.page_type).toBe("product")
    expect(model.entities[0]).toMatchObject({
      type: "product",
      name: "Example Camera",
      attributes: {
        low_price: "179",
        high_price: "199",
        price_currency: "USD",
      },
    })
    expect(model.state.properties).toMatchObject({
      cart_item_count: 2,
      selected_variant: "Black",
    })
    expect(model.actions.map((action) => action.type)).toEqual(
      expect.arrayContaining(["add_to_cart", "select_variant"])
    )
    expect(model.evidence).toContainEqual({
      source: "json_ld",
      field: "low_price",
      raw_value: "179",
    })
  })

  it("detects login pages and anonymous state", () => {
    const model = analyzePage(loginSignals)
    expect(model.page_type).toBe("login")
    expect(model.state.login_status).toBe("anonymous")
    expect(model.actions.map((action) => action.type)).toContain("login")
  })

  it("extracts job postings and download actions", () => {
    const model = analyzePage(jobSignals)
    expect(model.page_type).toBe("job")
    expect(model.entities[0]).toMatchObject({
      type: "job",
      name: "Staff Engineer",
    })
    expect(model.actions.map((action) => action.type)).toEqual(
      expect.arrayContaining(["submit", "download"])
    )
  })
})

describe("compressSignalsForModel", () => {
  it("keeps a compact packet without full HTML", () => {
    const packet = compressSignalsForModel(productSignals)
    expect(packet.text.length).toBeLessThanOrEqual(3_500)
    expect(packet.buttons).toContain("Add to cart")
    expect(JSON.stringify(packet)).not.toMatch(/<html/i)
  })
})
