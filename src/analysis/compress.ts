import type { PageSignals } from "../shared/signals.js"

/**
 * Build a token-efficient packet for optional LLM refinement.
 * Never includes raw HTML or full accessibility trees beyond a short excerpt.
 */
export function compressSignalsForModel(signals: PageSignals): {
  url: string
  title: string
  meta: Array<{ key: string; content: string }>
  text: string
  semantic: Array<{ tag: string; role?: string; text?: string }>
  accessibility_excerpt: string
  json_ld_types: string[]
  forms: Array<{
    method: string
    action?: string
    controls: Array<{
      kind: string
      type?: string
      name?: string
      label?: string
      options?: string[]
    }>
  }>
  buttons: string[]
  links: Array<{ label: string; href?: string }>
} {
  const meta = signals.meta.slice(0, 12).map((item) => ({
    key: item.property ?? item.name ?? "meta",
    content: item.content.slice(0, 240),
  }))

  const jsonLdTypes = signals.jsonLd.flatMap((value) => {
    if (!value || typeof value !== "object") return []
    const type = (value as Record<string, unknown>)["@type"]
    if (typeof type === "string") return [type]
    if (Array.isArray(type)) {
      return type.filter((entry): entry is string => typeof entry === "string")
    }
    return []
  })

  return {
    url: signals.finalUrl,
    title: signals.title.slice(0, 300),
    meta,
    text: signals.visibleText.slice(0, 3_500),
    semantic: signals.semanticDom.slice(0, 40).map((node) => ({
      tag: node.tag,
      role: node.role,
      text: node.text?.slice(0, 160),
    })),
    accessibility_excerpt: signals.accessibility.slice(0, 2_500),
    json_ld_types: [...new Set(jsonLdTypes)].slice(0, 30),
    forms: signals.forms.slice(0, 8).map((form) => ({
      method: form.method,
      action: form.action,
      controls: form.controls.slice(0, 20).map((control) => ({
        kind: control.kind,
        type: control.type,
        name: control.name,
        label: control.label,
        options: control.options?.slice(0, 12),
      })),
    })),
    buttons: signals.buttons
      .slice(0, 40)
      .map((button) => button.label.slice(0, 120)),
    links: signals.links.slice(0, 40).map((link) => ({
      label: link.label.slice(0, 120),
      href: link.href?.slice(0, 300),
    })),
  }
}
