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
})

export type AppConfig = z.infer<typeof EnvironmentSchema>

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env
): AppConfig {
  return EnvironmentSchema.parse(environment)
}
