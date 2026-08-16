import { z } from "zod"

export const JsonValueSchema: z.ZodType<
  string | number | boolean | null | Array<unknown> | Record<string, unknown>
> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ])
)

export const PageTypeSchema = z.enum([
  "product",
  "article",
  "hotel",
  "job",
  "order",
  "search_results",
  "login",
  "form",
  "homepage",
  "other",
])

export const EntitySchema = z
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
    attributes: z.record(z.string(), JsonValueSchema),
    evidence_ids: z.array(z.string().max(40)).max(10).optional(),
  })
  .strict()

export const StateSchema = z
  .object({
    login_status: z.enum(["authenticated", "anonymous", "unknown"]),
    properties: z.record(z.string(), JsonValueSchema),
    evidence_ids: z.array(z.string().max(40)).max(10).optional(),
  })
  .strict()

export const ActionTypeSchema = z.enum([
  "search",
  "login",
  "select_variant",
  "add_to_cart",
  "submit",
  "download",
])

export const ActionSchema = z
  .object({
    type: ActionTypeSchema,
    label: z.string().min(1).max(300),
    target: z.string().max(500).optional(),
    enabled: z.boolean(),
    required_inputs: z.array(z.string().max(200)).max(30),
    evidence_ids: z.array(z.string().max(40)).max(10).optional(),
  })
  .strict()

export const EvidenceSchema = z
  .object({
    id: z.string().max(40).optional(),
    source: z.enum([
      "url",
      "title",
      "meta",
      "visible_text",
      "semantic_dom",
      "accessibility",
      "json_ld",
      "form",
      "control",
      "link",
      "llm",
    ]),
    field: z.string().max(200).optional(),
    role: z.string().max(100).optional(),
    label: z.string().max(500).optional(),
    raw_value: JsonValueSchema.optional(),
    supports: z.array(z.string().max(100)).max(20).optional(),
  })
  .strict()

export const AgentPageModelSchema = z
  .object({
    page_type: PageTypeSchema,
    summary: z.string().min(1).max(2_000),
    entities: z.array(EntitySchema).max(50),
    state: StateSchema,
    actions: z.array(ActionSchema).max(100),
    evidence: z.array(EvidenceSchema).max(200),
    confidence: z.number().min(0).max(1),
  })
  .strict()

export type AgentPageModel = z.infer<typeof AgentPageModelSchema>
export type AgentAction = z.infer<typeof ActionSchema>
export type Evidence = z.infer<typeof EvidenceSchema>

export const UnderstandRequestSchema = z
  .object({
    url: z.url({ protocol: /^https?$/ }),
  })
  .strict()

export type UnderstandRequest = z.infer<typeof UnderstandRequestSchema>
