export type MetaSignal = {
  name?: string
  property?: string
  content: string
}

export type SemanticNode = {
  tag: string
  role?: string
  label?: string
  text?: string
}

export type FormControl = {
  kind: "input" | "select" | "textarea"
  type?: string
  name?: string
  label?: string
  placeholder?: string
  value?: string
  options?: string[]
  selected_options?: string[]
  required: boolean
  disabled: boolean
}

export type FormSignal = {
  action?: string
  method: string
  label?: string
  controls: FormControl[]
}

export type InteractiveSignal = {
  role: "button" | "link"
  label: string
  href?: string
  disabled?: boolean
}

export type WaitSignal = {
  network_idle: boolean
  content_stable: boolean
  waited_ms: number
}

export type PageSignals = {
  requestedUrl: string
  finalUrl: string
  title: string
  meta: MetaSignal[]
  visibleText: string
  semanticDom: SemanticNode[]
  accessibility: string
  jsonLd: unknown[]
  forms: FormSignal[]
  buttons: InteractiveSignal[]
  links: InteractiveSignal[]
  wait?: WaitSignal
}
