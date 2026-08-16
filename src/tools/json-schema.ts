import { z } from "zod"
import { JsonValueSchema } from "../schemas/agent-page-model.js"

export const JSON_VALUE_SCHEMA_ID = "JsonValue"

type JsonRecord = Record<string, unknown>

function rewriteRefs(node: unknown, replace: (ref: string) => string): unknown {
  if (Array.isArray(node)) {
    return node.map((child) => rewriteRefs(child, replace))
  }
  if (node && typeof node === "object") {
    const out: JsonRecord = {}
    for (const [key, value] of Object.entries(node as JsonRecord)) {
      if (key === "$ref" && typeof value === "string") {
        out[key] = replace(value)
      } else {
        out[key] = rewriteRefs(value, replace)
      }
    }
    return out
  }
  return node
}

function toSharedRef(ref: string): string {
  // Zod emits recursive JsonValue definitions as local `#/definitions/__schema0`
  // (or `#/$defs/...`). Point them at the shared, registered component instead so
  // both ajv validation and the OpenAPI document resolve the reference.
  if (ref.startsWith("#/definitions/") || ref.startsWith("#/$defs/")) {
    return `${JSON_VALUE_SCHEMA_ID}#`
  }
  return ref
}

/**
 * Converts a Zod schema to a self-contained OpenAPI 3.0 JSON schema whose only
 * external reference is the shared {@link JSON_VALUE_SCHEMA_ID} component.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { target: "openapi-3.0" }) as JsonRecord
  const { definitions: _definitions, $defs: _defs, ...rest } = raw
  return rewriteRefs(rest, toSharedRef) as Record<string, unknown>
}

/**
 * The shared recursive JSON value schema, registered once so `$ref` targets
 * resolve in Fastify validation and in `/openapi.json`.
 */
export function jsonValueComponentSchema(): Record<string, unknown> {
  const raw = z.toJSONSchema(JsonValueSchema, {
    target: "openapi-3.0",
  }) as JsonRecord
  const { definitions: _definitions, $defs: _defs, ...rest } = raw
  return {
    $id: JSON_VALUE_SCHEMA_ID,
    ...(rewriteRefs(rest, (ref) =>
      ref === "#" ||
      ref.startsWith("#/definitions/") ||
      ref.startsWith("#/$defs/")
        ? `${JSON_VALUE_SCHEMA_ID}#`
        : ref
    ) as Record<string, unknown>),
  }
}
