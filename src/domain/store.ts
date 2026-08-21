import type { z } from "zod"
import type {
  CatalogTool,
  InvocationEvent,
  RegisterToolRequest,
  ToolSearchQuery,
  ToolStatusSchema,
  TrustProfile,
  VerificationCheckRecord,
} from "./types.js"

export type ToolStatus = z.infer<typeof ToolStatusSchema>

export type EnsureToolOptions = {
  status?: ToolStatus
  providerVerified?: boolean
}

export type ProviderRecord = {
  id: string
  slug: string
  name: string
  website_url: string | null
  identity_type: string
  identity_value: string
  verified: boolean
  metadata: Record<string, unknown>
}

/**
 * Persistence port for the ecosystem catalog.
 * Postgres for production; in-memory for tests and DB-less local runs.
 */
export interface CatalogStore {
  registerTool(input: RegisterToolRequest): Promise<CatalogTool>
  /**
   * Idempotent registration used for first-party seeding and re-deploys.
   * Creates when missing; updates mutable metadata when present.
   */
  ensureTool(
    input: RegisterToolRequest,
    options?: EnsureToolOptions
  ): Promise<CatalogTool>
  getToolBySlug(slug: string): Promise<CatalogTool | null>
  getToolById(id: string): Promise<CatalogTool | null>
  searchTools(query: ToolSearchQuery): Promise<CatalogTool[]>
  listToolIdsForVerification(limit?: number): Promise<string[]>
  getEndpointForTool(
    toolId: string
  ): Promise<{ id: string; url: string; transport: string } | null>
  insertVerificationCheck(
    check: Omit<VerificationCheckRecord, "id" | "checked_at"> & {
      checked_at?: string
    }
  ): Promise<VerificationCheckRecord>
  listVerificationChecks(
    toolId: string,
    limit?: number
  ): Promise<VerificationCheckRecord[]>
  upsertTrustProfile(toolId: string, profile: TrustProfile): Promise<void>
  recordInvocation(event: InvocationEvent): Promise<void>
  usageStats(
    toolId: string,
    sinceMs?: number
  ): Promise<{ invocations: number; successes: number }>
  getProviderBySlug(slug: string): Promise<ProviderRecord | null>
  setProviderVerified(
    slug: string,
    verified: boolean,
    metadataPatch?: Record<string, unknown>
  ): Promise<ProviderRecord | null>
  setProviderMetadata(
    slug: string,
    metadata: Record<string, unknown>
  ): Promise<ProviderRecord | null>
  setToolStatus(toolId: string, status: ToolStatus): Promise<void>
}
