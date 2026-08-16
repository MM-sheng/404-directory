import {
  AgentPageModelSchema,
  type AgentAction,
  type AgentPageModel,
  type Evidence,
} from "../schemas/agent-page-model.js"
import type { PageSignals } from "../shared/signals.js"

type JsonObject = Record<string, unknown>
type JsonPrimitive = string | number | boolean

const LABELS = {
  search: /\b(search|find|query)\b|搜索|查找|检索/i,
  login: /\b(log[ -]?in|sign[ -]?in|sign[ -]?up|register)\b|登录|登陆|注册/i,
  addToCart:
    /\badd(?:\s+to)?\s+(?:cart|bag|basket)\b|加入购物车|添加到购物车|放入购物车/i,
  submit:
    /\b(submit|send|continue|apply|confirm|save|checkout|place order)\b|提交|发送|继续|申请|确认|保存|结算|下单/i,
  download: /\b(download|export)\b|下载|导出/i,
  logout: /\b(log[ -]?out|sign[ -]?out|account)\b|退出登录|我的账户|个人中心/i,
  cart: /\b(?:cart|bag|basket)\b|购物车/i,
  variant:
    /\b(?:size|color|colour|variant|style|option)\b|尺码|颜色|规格|款式|版本/i,
}

const SCHEMA_TYPE_MAP: Record<
  string,
  AgentPageModel["entities"][number]["type"]
> = {
  product: "product",
  individualproduct: "product",
  productmodel: "product",
  someproducts: "product",
  article: "article",
  newsarticle: "article",
  blogposting: "article",
  techarticle: "article",
  report: "article",
  hotel: "hotel",
  lodgingbusiness: "hotel",
  motel: "hotel",
  resort: "hotel",
  jobposting: "job",
  order: "order",
  organization: "organization",
  corporation: "organization",
  localbusiness: "organization",
  person: "person",
  place: "place",
  touristattraction: "place",
}

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined
}

function compactValue(value: unknown): JsonPrimitive | undefined {
  if (typeof value === "string")
    return value.replace(/\s+/g, " ").trim().slice(0, 500)
  if (typeof value === "number" || typeof value === "boolean") return value
  return undefined
}

function schemaTypes(item: JsonObject): string[] {
  const type = item["@type"]
  return (Array.isArray(type) ? type : [type]).filter(
    (entry): entry is string => typeof entry === "string"
  )
}

function flattenJsonLd(values: unknown[]): JsonObject[] {
  const result: JsonObject[] = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const item = object(value)
    if (!item || result.length >= 100) return
    result.push(item)
    if (item["@graph"]) visit(item["@graph"])
    if (item.mainEntity) visit(item.mainEntity)
    if (item.itemListElement) visit(item.itemListElement)
  }
  values.forEach(visit)
  return result
}

function firstOffer(item: JsonObject): JsonObject | undefined {
  if (Array.isArray(item.offers)) {
    return object(item.offers[0]) ?? object(item.offers.find(Boolean))
  }
  return object(item.offers)
}

function detectPageType(
  signals: PageSignals,
  jsonLd: JsonObject[]
): AgentPageModel["page_type"] {
  const types = new Set(
    jsonLd.flatMap(schemaTypes).map((type) => type.toLowerCase())
  )
  if (
    ["product", "individualproduct", "productmodel", "someproducts"].some(
      (type) => types.has(type)
    )
  ) {
    return "product"
  }
  if (
    ["hotel", "lodgingbusiness", "motel", "resort"].some((type) =>
      types.has(type)
    )
  ) {
    return "hotel"
  }
  if (types.has("jobposting")) return "job"
  if (types.has("order")) return "order"
  if (
    ["article", "newsarticle", "blogposting", "techarticle", "report"].some(
      (type) => types.has(type)
    )
  ) {
    return "article"
  }
  if (types.has("itemlist") || types.has("searchresultspage")) {
    return "search_results"
  }

  const hint = `${signals.finalUrl} ${signals.title} ${signals.meta
    .map((item) => `${item.property ?? item.name ?? ""} ${item.content}`)
    .join(" ")} ${signals.visibleText.slice(0, 800)}`.toLowerCase()

  if (/\bproduct\b|\/(?:products?|p|dp|item)\//.test(hint)) return "product"
  if (/\b(article|blog|news)\b|\/(?:articles?|blog|news|posts?)\//.test(hint))
    return "article"
  if (/\bhotel\b|\/(?:hotels?|rooms?)\//.test(hint)) return "hotel"
  if (/\b(job|career|hiring)\b|\/(?:jobs?|careers?)\//.test(hint)) return "job"
  if (/\border\b|\/(?:orders?|checkout)\//.test(hint)) return "order"
  if (/\b(search|results?)\b|[?&]q=/.test(hint)) return "search_results"

  const passwordForm = signals.forms.some((form) =>
    form.controls.some((control) => control.type === "password")
  )
  if (
    passwordForm ||
    signals.buttons.some((button) => LABELS.login.test(button.label))
  ) {
    return "login"
  }
  if (signals.forms.length > 0) return "form"
  try {
    if (new URL(signals.finalUrl).pathname === "/") return "homepage"
  } catch {
    // Keep analysis total if URL parsing somehow fails.
  }
  return "other"
}

function entityFromJsonLd(item: JsonObject) {
  const matchedType = schemaTypes(item)
    .map((type) => type.toLowerCase())
    .find((type) => SCHEMA_TYPE_MAP[type])
  if (!matchedType) return undefined

  const name = compactValue(item.name) ?? compactValue(item.headline)
  if (typeof name !== "string" || !name) return undefined

  const offers = firstOffer(item)
  const attributes: Record<string, JsonPrimitive> = {}
  const selected: Array<[string, unknown]> = [
    ["description", item.description],
    ["sku", item.sku],
    ["gtin", item.gtin ?? item.gtin13 ?? item.gtin8],
    ["brand", object(item.brand)?.name ?? item.brand],
    ["price", offers?.price ?? offers?.lowPrice ?? item.price],
    [
      "price_currency",
      offers?.priceCurrency ?? offers?.priceCurrency ?? item.priceCurrency,
    ],
    ["low_price", offers?.lowPrice],
    ["high_price", offers?.highPrice],
    ["availability", offers?.availability ?? item.availability],
    ["rating", object(item.aggregateRating)?.ratingValue],
    ["review_count", object(item.aggregateRating)?.reviewCount],
    ["author", object(item.author)?.name ?? item.author],
    ["date_published", item.datePublished],
    ["employment_type", item.employmentType],
    [
      "hiring_organization",
      object(item.hiringOrganization)?.name ?? item.hiringOrganization,
    ],
    ["order_status", item.orderStatus],
    ["order_number", item.orderNumber],
    ["address", object(item.address)?.streetAddress ?? item.address],
    ["telephone", item.telephone],
  ]
  for (const [key, value] of selected) {
    const compact = compactValue(value)
    if (compact !== undefined && compact !== "") attributes[key] = compact
  }

  return { type: SCHEMA_TYPE_MAP[matchedType], name, attributes }
}

function inferActions(signals: PageSignals): {
  actions: AgentAction[]
  evidence: Evidence[]
} {
  const actions: AgentAction[] = []
  const evidence: Evidence[] = []
  const add = (action: AgentAction, item: Evidence) => {
    const key = `${action.type}:${action.label.toLowerCase()}`
    if (
      actions.some(
        (existing) => `${existing.type}:${existing.label.toLowerCase()}` === key
      )
    ) {
      return
    }
    actions.push(action)
    evidence.push(item)
  }

  for (const button of signals.buttons) {
    const common = {
      label: button.label,
      enabled: !button.disabled,
      required_inputs: [] as string[],
    }
    if (LABELS.search.test(button.label)) {
      add(
        { type: "search", ...common },
        { source: "accessibility", role: "button", label: button.label }
      )
    } else if (LABELS.login.test(button.label)) {
      add(
        { type: "login", ...common },
        { source: "accessibility", role: "button", label: button.label }
      )
    } else if (LABELS.addToCart.test(button.label)) {
      add(
        { type: "add_to_cart", ...common },
        { source: "accessibility", role: "button", label: button.label }
      )
    } else if (LABELS.download.test(button.label)) {
      add(
        { type: "download", ...common },
        { source: "accessibility", role: "button", label: button.label }
      )
    } else if (LABELS.variant.test(button.label)) {
      add(
        {
          type: "select_variant",
          ...common,
          required_inputs: [button.label],
        },
        { source: "accessibility", role: "button", label: button.label }
      )
    } else if (LABELS.submit.test(button.label)) {
      add(
        { type: "submit", ...common },
        { source: "accessibility", role: "button", label: button.label }
      )
    }
  }

  for (const form of signals.forms) {
    const required = form.controls
      .filter((control) => control.required)
      .map((control) => control.name ?? control.label ?? control.kind)
    const searchable = form.controls.some(
      (control) =>
        control.type === "search" ||
        LABELS.search.test(`${control.name ?? ""} ${control.label ?? ""}`)
    )
    const loginForm = form.controls.some(
      (control) =>
        control.type === "password" ||
        LABELS.login.test(`${control.name ?? ""} ${control.label ?? ""}`)
    )

    if (searchable) {
      add(
        {
          type: "search",
          label: form.label || "Search",
          target: form.action,
          enabled: true,
          required_inputs: required,
        },
        {
          source: "form",
          field: "search",
          label: form.label,
          raw_value: form.action,
        }
      )
    }
    if (loginForm) {
      add(
        {
          type: "login",
          label: form.label || "Login",
          target: form.action,
          enabled: true,
          required_inputs: required,
        },
        {
          source: "form",
          field: "login",
          label: form.label,
          raw_value: form.action,
        }
      )
    }

    for (const control of form.controls) {
      if (
        control.kind === "select" ||
        LABELS.variant.test(control.label ?? "")
      ) {
        add(
          {
            type: "select_variant",
            label: control.label || control.name || "Select option",
            enabled: !control.disabled,
            required_inputs: [control.name ?? control.label ?? "selection"],
          },
          {
            source: "control",
            role: control.kind,
            label: control.label ?? control.name,
            raw_value: control.options ?? control.value,
          }
        )
      }
    }

    if (!searchable && !loginForm && form.controls.length > 0) {
      add(
        {
          type: "submit",
          label: form.label || "Submit form",
          target: form.action,
          enabled: true,
          required_inputs: required,
        },
        {
          source: "form",
          field: "submit",
          label: form.label,
          raw_value: form.action,
        }
      )
    }
  }

  for (const link of signals.links) {
    const isDownload =
      LABELS.download.test(link.label) ||
      /\.(?:pdf|zip|csv|xlsx?|docx?)(?:[?#]|$)/i.test(link.href ?? "")
    if (isDownload) {
      add(
        {
          type: "download",
          label: link.label,
          target: link.href,
          enabled: true,
          required_inputs: [],
        },
        {
          source: "link",
          role: "link",
          label: link.label,
          raw_value: link.href,
        }
      )
    } else if (LABELS.login.test(link.label)) {
      add(
        {
          type: "login",
          label: link.label,
          target: link.href,
          enabled: true,
          required_inputs: [],
        },
        {
          source: "link",
          role: "link",
          label: link.label,
          raw_value: link.href,
        }
      )
    }
  }

  return { actions: actions.slice(0, 100), evidence }
}

function inferCartState(signals: PageSignals): {
  properties: Record<string, JsonPrimitive>
  evidence: Evidence[]
} {
  const properties: Record<string, JsonPrimitive> = {}
  const evidence: Evidence[] = []
  const corpus = [
    signals.visibleText,
    signals.accessibility,
    ...signals.buttons.map((button) => button.label),
    ...signals.links.map((link) => link.label),
  ].join("\n")

  const cartCount = corpus.match(
    /(?:cart|bag|basket|购物车)[^\d]{0,12}(\d{1,3})|(\d{1,3})[^\d]{0,8}(?:items? in (?:cart|bag))/i
  )
  if (cartCount) {
    const count = Number(cartCount[1] ?? cartCount[2])
    if (Number.isFinite(count)) {
      properties.cart_item_count = count
      evidence.push({
        source: "visible_text",
        field: "cart_item_count",
        raw_value: count,
      })
    }
  } else if (LABELS.cart.test(corpus)) {
    properties.cart_present = true
    evidence.push({
      source: "accessibility",
      field: "cart_present",
      raw_value: true,
    })
  }

  return { properties, evidence }
}

function inferLoginStatus(signals: PageSignals, actions: AgentAction[]) {
  const labels = signals.buttons
    .concat(signals.links)
    .map((item) => item.label)
    .join(" ")
  const hasLogout = /\b(log[ -]?out|sign[ -]?out)\b|退出登录/i.test(labels)
  const hasAccount =
    /\b(my account|account|profile|dashboard)\b|我的账户|个人中心/i.test(labels)
  const hasLogin = actions.some((action) => action.type === "login")
  const hasPassword = signals.forms.some((form) =>
    form.controls.some((control) => control.type === "password")
  )

  if (hasLogout || (hasAccount && !hasLogin && !hasPassword)) {
    return {
      status: "authenticated" as const,
      evidence: {
        source: "accessibility" as const,
        field: "login_status",
        raw_value: hasLogout ? "logout" : "account",
      },
    }
  }
  if (hasLogin || hasPassword) {
    return {
      status: "anonymous" as const,
      evidence: {
        source: hasPassword ? ("form" as const) : ("accessibility" as const),
        field: "login_status",
        raw_value: hasPassword ? "password_field" : "login_affordance",
      },
    }
  }
  return {
    status: "unknown" as const,
    evidence: undefined,
  }
}

export function analyzePage(signals: PageSignals): AgentPageModel {
  const jsonLd = flattenJsonLd(signals.jsonLd)
  const pageType = detectPageType(signals, jsonLd)
  const entities = jsonLd.flatMap((item) => {
    const entity = entityFromJsonLd(item)
    return entity ? [entity] : []
  })
  const evidence: Evidence[] = [
    { source: "url", field: "final_url", raw_value: signals.finalUrl },
    { source: "title", field: "title", raw_value: signals.title },
  ]

  if (signals.wait) {
    evidence.push({
      source: "meta",
      field: "wait",
      raw_value: signals.wait,
    })
  }

  for (const item of jsonLd.slice(0, 20)) {
    const entity = entityFromJsonLd(item)
    if (!entity) continue
    evidence.push({
      source: "json_ld",
      field: "@type",
      raw_value: schemaTypes(item).join(", "),
    })
    for (const field of [
      "price",
      "price_currency",
      "availability",
      "low_price",
      "high_price",
      "order_status",
    ] as const) {
      if (entity.attributes[field] !== undefined) {
        evidence.push({
          source: "json_ld",
          field,
          raw_value: entity.attributes[field],
        })
      }
    }
  }

  const text = signals.visibleText
  const properties: Record<string, JsonPrimitive> = {}
  const priceMatches = [
    ...text.matchAll(
      /(?:[$€£¥]\s?\d[\d,.]*(?:\.\d{1,2})?|\d[\d,.]*(?:\.\d{1,2})?\s?(?:USD|EUR|GBP|CNY|RMB))/gi
    ),
  ].map((match) => match[0])
  if (priceMatches[0]) {
    properties.price_text = priceMatches[0]
    evidence.push({
      source: "visible_text",
      field: "price",
      raw_value: priceMatches[0],
    })
  }
  if (priceMatches.length > 1) {
    properties.price_candidates = priceMatches.slice(0, 5).join(" | ")
  }

  const availability = text.match(
    /\b(?:in stock|out of stock|available|sold out|limited stock)\b|有货|缺货|售罄|现货/i
  )?.[0]
  if (availability) {
    properties.availability = availability
    evidence.push({
      source: "visible_text",
      field: "availability",
      raw_value: availability,
    })
  }

  const selectedVariant = signals.forms
    .flatMap((form) => form.controls)
    .find(
      (control) =>
        control.kind === "select" &&
        (control.selected_options?.length || control.options?.length)
    )
  const selectedValue =
    selectedVariant?.selected_options?.[0] ?? selectedVariant?.options?.[0]
  if (selectedValue) {
    properties.selected_variant = selectedValue
    evidence.push({
      source: "control",
      field: "selected_variant",
      label: selectedVariant?.label ?? selectedVariant?.name,
      raw_value: selectedValue,
    })
  }

  for (const entity of entities) {
    for (const field of [
      "price",
      "price_currency",
      "availability",
      "order_status",
      "low_price",
      "high_price",
    ] as const) {
      const value = entity.attributes[field]
      if (value !== undefined) properties[field] = value
    }
  }

  const cart = inferCartState(signals)
  Object.assign(properties, cart.properties)
  evidence.push(...cart.evidence)

  const inferred = inferActions(signals)
  evidence.push(...inferred.evidence)
  const login = inferLoginStatus(signals, inferred.actions)
  if (login.evidence) evidence.push(login.evidence)

  const description =
    signals.meta.find((item) => item.name?.toLowerCase() === "description")
      ?.content ??
    signals.meta.find(
      (item) => item.property?.toLowerCase() === "og:description"
    )?.content
  const entityHint = entities[0]
    ? `${entities[0].type}: ${entities[0].name}`
    : undefined
  const summaryBase =
    description ||
    entityHint ||
    signals.visibleText.slice(0, 400) ||
    signals.title
  const summary = `${signals.title || "Untitled page"} — ${summaryBase}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2_000)

  const signalScore =
    (jsonLd.length > 0 ? 0.25 : 0) +
    (signals.accessibility ? 0.15 : 0) +
    (signals.semanticDom.length > 0 ? 0.1 : 0) +
    (signals.visibleText.length > 100 ? 0.1 : 0) +
    (inferred.actions.length > 0 ? 0.1 : 0) +
    (signals.wait?.content_stable ? 0.05 : 0)
  const confidence = Math.min(0.95, 0.3 + signalScore)

  return AgentPageModelSchema.parse({
    page_type: pageType,
    summary,
    entities: entities.slice(0, 50),
    state: { login_status: login.status, properties },
    actions: inferred.actions,
    evidence: evidence.slice(0, 200),
    confidence,
  })
}
