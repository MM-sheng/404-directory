import "dotenv/config"
import { z } from "zod"

const EnvironmentSchema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4040),
  PUBLIC_BASE_URL: z.string().default("https://404.directory"),
  PAGE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(20_000),
  NETWORK_IDLE_MS: z.coerce.number().int().min(0).max(30_000).default(3_000),
  STABILITY_POLL_MS: z.coerce.number().int().min(100).max(5_000).default(400),
  MAX_WAIT_MS: z.coerce.number().int().min(0).max(60_000).default(5_000),
  MAX_TEXT_CHARS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(100_000)
    .default(20_000),
  MAX_ELEMENTS: z.coerce.number().int().min(10).max(2_000).default(200),
  BROWSER_EGRESS_ALLOWED_PORTS: z
    .string()
    .default("80,443")
    .transform((value, context) => {
      const ports = [
        ...new Set(value.split(",").map((part) => Number(part.trim()))),
      ]
      if (
        ports.length === 0 ||
        ports.some(
          (port) => !Number.isInteger(port) || port < 1 || port > 65_535
        )
      ) {
        context.addIssue({
          code: "custom",
          message:
            "BROWSER_EGRESS_ALLOWED_PORTS must be comma-separated TCP ports",
        })
        return z.NEVER
      }
      return ports
    }),
  BROWSER_MAX_RESOURCE_BYTES: z.coerce
    .number()
    .int()
    .min(64 * 1_024)
    .max(50 * 1_024 * 1_024)
    .default(5 * 1_024 * 1_024),
  HEADLESS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  ENABLE_LLM: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  MODEL_BASE_URL: z.string().default("https://api.openai.com/v1"),
  MODEL_API_KEY: z.string().optional(),
  MODEL_ID: z.string().default("gpt-4o-mini"),
  LLM_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(12_000),
  VERIFY_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(10_000),
  VERIFY_MAX_BODY_BYTES: z.coerce
    .number()
    .int()
    .min(4_096)
    .max(5_000_000)
    .default(512_000),
  VERIFY_MAX_REDIRECTS: z.coerce.number().int().min(0).max(10).default(5),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(60),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(3_600_000)
    .default(60_000),
  TOOL_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(20),
  API_KEYS: z
    .string()
    .default("")
    .transform((value, context) => {
      const keys = [
        ...new Set(
          value
            .split(",")
            .map((key) => key.trim())
            .filter(Boolean)
        ),
      ]
      if (keys.some((key) => key.length < 24)) {
        context.addIssue({
          code: "custom",
          message: "Every API key must contain at least 24 characters",
        })
        return z.NEVER
      }
      return keys
    }),
})

export type AppConfig = z.infer<typeof EnvironmentSchema>

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env
): AppConfig {
  return EnvironmentSchema.parse(environment)
}
