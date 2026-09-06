# RFC-0004: The Search Layer for the Agent Web (V1)

| Field | Value |
| --- | --- |
| Status | **Draft r2.1 — product architecture ACK'd; Phase 1 DB still blocked until this revision is committed on a clean `origin/main` worktree** |
| Authors | Chief Product Architect (agent) |
| Date | 2026-09-06 (r2.1) |
| Audit baseline | Git tag **`v0.10.3`** (`SERVICE_VERSION` / `package.json`) |
| Production rollback revision | **`directory-404-v0103-f974214`** (confirmed) |
| Local worktree note | Shared worktree on `release/v0.10.0` is **not** an implementation base. After r2.1: new independent worktree from `origin/main`, commit RFC only, then authorize Phase 1. |
| Implementation | **Phase 1 DB not ACK'd yet** — r2.1 design-only; no migrations/business code in the old worktree |
| Supersedes (product brand) | Risk/Trust/Polymarket as *core brand*; they remain support signals / vertical apps (ADR 0002/0003 stay historically accurate) |
| Revision focus (r2.1) | Probe cannot upgrade `access_mode` · Interface assertions · Outcome candidate FK + API statuses · keyed HMAC / atomic token / backfill uniqueness / merge authority |

---

## 1. Executive Summary

404.directory V1 should stop being “Agent Action Risk Preflight” and become:

> **The Search Layer for the Agent Web** — a real-time search engine over the machine-accessible world that Agents share.

404 does **not** reason for the Agent and does **not** claim to recommend the “best” tool. It maintains **shared external state**: what resources exist, what they can do, which interfaces reach them, whether they are currently usable, how schemas/auth/capabilities change, recent latency/failure/compatibility, and bounded cross-Agent outcomes.

**Core value:** Reduce exploration cost.  
**Core assets:** Shared External State + Operational History + Cross-Agent Outcome Data (privacy-safe, anti-poisoned).

**V1 product wedge (locked):** Coding + Research Agents; public remote **auth=none** MCP Interfaces whose `access_mode` has been confirmed **`read_only` by human curation / explicit verification** (probe may only *downgrade*); three new Agent actions — **`search_resources`**, **`inspect_resource`**, **`report_resource_outcome`** — via **Strangler / dual-track** migration.

**Resource (locked definition):** a **service surface with independent machine-capability semantics** (e.g. “OpenAI Developer Documentation”). MCP is an **Interface** to that surface — not the Resource itself. Neither “the entire GitHub company” nor “each raw endpoint URL” is a Resource.

**Why now (code-backed):** Today’s catalog is Tool-centric lexical search (`catalog-lexical-v2`), ~9 seeded catalog rows, 16 MCP service tools, probes that write `verification_checks` but not a unified Observation model, and usage receipts that exist in schema but are **HTTP-disabled** for trust poisoning. Search does not expose live probe state in results. Ranking leans on Trust overall score and 7d invocations — not Operational Fit or Observation provenance. That cannot deliver “Search Layer for the Agent Web.”

**Product architecture is ACK'd.** r2.1 closes four remaining Phase-1 DB blockers (§Appendix B). Next: commit this RFC on a **new worktree from `origin/main`**, then authorize Phase 1 — **not** on `release/v0.10.0`.

---

## 2. Current-State Audit

### 2.1 Audit method

- Source of truth: tag **`v0.10.3`**.
- Docs vs code: **code wins**; mismatches recorded below.
- Production metrics cited as **product signals only** (operator brief + `docs/DISTRIBUTION_STATUS.md` on tag); not claims of real users.

### 2.2 Brand and surface (code)

| Fact | Citation |
| --- | --- |
| Version `0.10.3` | `package.json`, `src/version.ts` |
| MCP title: “Agent Action Risk Preflight” | `src/mcp/create-server.ts` |
| Homepage: “Risk preflight before an Agent acts.” | `src/http/homepage.ts` |
| Package description: Polymarket-first risk preflight | `package.json` `description` |
| ADR 0003: Polymarket as primary acquisition wedge | `docs/adr/0003-…md` |
| ADR 0002 file says Accepted; ADR README marks Superseded | **Docs inconsistency** — README overstates vs file header |

### 2.3 Catalog unit = Tool (no Resource)

`CatalogTool` in `src/domain/types.ts`: slug, name, description, `capabilities: string[]`, protocol `mcp|api|a2a`, status lifecycle, `auth_requirement`, single nested provider + trust + usage. **No Resource / ResourceInterface / Observation domain types.**

Capabilities are **unconstrained string arrays** (Zod max 32 × 64 chars) — no capability registry, aliases, or hierarchy (`types.ts` register schema; graph derives Jaccard in-memory in `capability-graph.ts`).

### 2.4 Persistence (PostgreSQL + Drizzle)

Migrations `drizzle/0000` … `0009` on tag `v0.10.3`:

| Table | Role today |
| --- | --- |
| `providers`, `tools`, `tool_versions`, `endpoints` | Tool catalog |
| `agents` | **Migrated but unused by CatalogStore** |
| `verification_checks` | Probe snapshots (latest used heavily by Trust) |
| `trust_scores` | Per-tool dimensional Trust v1 |
| `invocations` | Telemetry + Agent attribution |
| `activation_events` | Funnel |
| `usage_receipts` | Discovery→selection→outcome schema **exists** |
| `risk_evaluations`, `prediction_market_evaluations` | Vertical preflight |
| `verified_agent_admissions` | Pilot verified-agent evidence |

`usage_receipts` columns (from `src/db/schema.ts` / `0001`): `client_id`, `discovery_query`, `candidate_slugs[]`, `selected_slug`, `outcome`, `latency_ms`, `error_type`, `metadata` — conceptually close to DiscoveryReceipt, but **write path is closed**.

### 2.5 Search = `catalog-lexical-v2`

File: `src/domain/catalog-search.ts`.

- Term extraction: NFKC, filler drop; all-filler does **not** become full listing.
- **Hard filters:** status (default discoverable = `active|degraded`), protocol, category, capability substring, trust_threshold.
- **Relevance:** all meaningful terms required; field weights slug/name 12, capabilities 8, provider 6, category 3, description 1; exact name/slug +10000; phrase +30.
- **Rank:** relevance → adjusted trust (`overall − 0.15` if degraded) → `invocations_7d` → slug.
- Postgres (`postgres-store.ts` `searchTools`): SQL filters status/protocol/category only; **lexical rank in application memory**; no FTS/pg_trgm/pgvector.
- Response exposes `algorithm_version`, `match_mode: "all_meaningful_terms"` — **does not attach last probe status/latency to each hit**.

### 2.6 Probe / verification

`src/domain/verification.ts` + worker `src/workers/verification-worker.ts`:

- MCP: SSRF-gated public URL → initialize (handshake) → `tools/list` → shallow `schema_consistency` (“deep schema diff later”) → derived TLS/availability/latency/error_rate.
- Stored as `verification_checks` rows; scheduling via `next_verify_at`, lease `FOR UPDATE SKIP LOCKED`, success reschedule **30m**, fail exponential backoff 5m→24h.
- Lifecycle degrade/suspend in `lifecycle.ts`.
- **No unified Observation append model**, no schema fingerprint table, **no per-host polite rate limit** beyond batch/interval/timeouts.
- Trust (`trust.ts` `TRUST_ALGORITHM_VERSION = "v1"`) collapses **latest** check per type into availability/compatibility/security — history exists in table but ranking uses Trust overall, not Observation streams.

### 2.7 MCP + REST inventory

**16 MCP tools** when catalog + gateway enabled:

- First-party: `verify_web`, `understand_webpage`
- Discovery: `search_tools`, `get_tool`, `compare_tools`, `get_trust_score`, `recommend_tools`, `list_capabilities`, `get_capability_graph`
- Risk: `evaluate_tool_risk`, `report_tool_outcome`
- Prediction: `evaluate_prediction_market`, `report_prediction_market_outcome`
- Gateway (MCP-only): `search_official_docs`, `inspect_tool_server`, `invoke_registered_tool`

REST `src/domain/http/v1-routes.ts`: register/search/compare/trust/verifications/capabilities/graph; risk + PM evaluations; agent metrics; **`POST /v1/receipts` → 403 `receipts_disabled`** (comment: anonymous receipts are a trust-poisoning vector until Agent API keys + signed receipts).

Gateway constraints (`remote-gateway.ts` / discovery-tools): auth `none`, provider verified, allowlist, non-destructive, size bounds — **already aligned with V1 corpus boundary**, but framed as curated invoke, not Search Layer.

### 2.8 Seeds ≈ 9 catalog tools

- 6 curated remote MCP: openai/huggingface/deepwiki/microsoft-learn/aws/cloudflare docs (`seed-curated-mcp.ts`)
- 3 first-party: `understand_webpage`, `verify_web`, `404_mcp` (`seed-first-party.ts`)

Listing count is **not** a moat — it is the exploration-cost problem.

### 2.9 Telemetry / identity

`agent-attribution.ts` + `telemetry.ts`: kinds `explicit|anonymous|internal`; `is_external` excludes internal and known non-user clients. Must stay separate from Outcome provenance classes in V1.

### 2.10 Evals lag product

`evals/` measures ~0.4.x first-party web tool routing. **No** discovery-task benchmark for catalog search, Living Index, or Exploration Saved. ADR-driven Risk/PM evals exist as unit tests, not Agent discovery benchmarks.

### 2.11 Operator product signals (not “users”)

Treat as signals only:

- Strict verified external Agents: **0** (pilot admissions path exists; not product success).
- Unverified installation IDs / successful unverified invocations / zero later-day retention — confirm funnel leak: `initialize`/`tools/list` ≫ useful work; `search_tools` used; `invoke_registered_tool` often fails.
- ~9 searchable catalog entries vs 16 self-tools — Agents explore 404’s *service surface*, not a shared resource index.

---

## 3. Product Scope and Non-goals

### 3.1 In scope (V1)

1. Reposition product language toward Search Layer (homepage/MCP/docs) **without** breaking old tool names.
2. Additive domain: Resource, ResourceInterface, Capability (normalized), Observation, DiscoveryReceipt/SearchSession, OutcomeReport.
3. New Agent surface: `search_resources`, `inspect_resource`, `report_resource_outcome` (MCP + REST), parallel to legacy.
4. Living Index ranking over Interfaces with confirmed `access_mode=read_only`, auth=none, non-unknown live status.
5. Live Probe → Observation append; Search reads **aggregated state**, never blocks on live probe.
6. Anti-poisoning for outcomes; DiscoveryReceipt binding.
7. Dual-track migration from tools/endpoints/verification_checks/invocations.
8. Discovery Task benchmark + kill criteria.

### 3.2 Explicit non-goals (locked)

- OAuth / API key custody / paid resources / secrets management
- Arbitrary remote invocation as core product (gateway may remain **compatibility** for curated allowlist)
- OpenAPI whole-web index / new Agent protocol
- “Best tool” leaderboard / paid ranking
- Graph DB / microservice split
- Storing prompts, credentials, business payloads, full model outputs, PII
- One-shot replacement of Tool API or deletion of Risk/PM verticals

### 3.3 Repositioning existing wedges

| Current | V1 role |
| --- | --- |
| Risk preflight | Support signal / optional vertical; not brand center |
| Trust overall score | Compatibility signal; **not** safety probability; **not** primary Search rank |
| Polymarket | Independent vertical app |
| Remote gateway invoke | Compatibility / curated read-only bridge; not Search Layer definition |
| `search_tools` / `get_tool` | Legacy adapters over Resource index |

---

## 4. Current → Target Capability Mapping

| Current capability | Target | Migration posture |
| --- | --- | --- |
| `tools` row | `resources` subtype `catalog_tool` (or `mcp_server` for curated remotes) | Map 1:1 initially |
| `endpoints` | `resource_interfaces` type `mcp_streamable_http` (etc.) | Map 1:1 |
| `capabilities text[]` | `capabilities` + `resource_capabilities` + aliases | Normalize gradually |
| `verification_checks` | `observations` type `probe_*` provenance `404_observed` | Backfill as **low/medium** confidence; do not invent `independently_verified` |
| `invocations` | optional `observations` type `invocation_*` provenance by identity kind | Never upgrade anonymous to high trust |
| `usage_receipts` (disabled) | `discovery_receipts` + `outcome_reports` with anti-poison | Replace write path; keep table frozen or view |
| `trust_scores` | **Frozen Trust v1** — marked legacy in responses | Continue serving `get_trust_score`; stop treating as Living Index input |
| `risk_*` / `prediction_market_*` | Unchanged vertical tables | No Resource coupling in V1 |
| `search_tools` | Adapter → Resource search OR parallel | Keep stable contract |
| `get_tool` | Adapter → `inspect_resource` projection | Keep stable |
| `report_*_outcome` (risk/PM) | Stay vertical-specific | Do not conflate with `report_resource_outcome` |
| `invoke_registered_tool` | Compatibility only | Remove from primary MCP instructions / homepage main path |
| Capability graph `cap_v1` | Rebuild on Capability IDs later | Keep Jaccard on strings Phase A |

---

## 5. Proposed Domain Model

```text
Provider 1──* Resource 1──* ResourceInterface
                │ 1
                ├──* resource_external_ids / resource_sources
                ├──* resource_field_provenance (Resource-level facets)
                │   resource_interface_assertions (Interface-level facets)
                ├──* ResourceCapability *──1 Capability (+ aliases, optional parent)
                ├──* resource_merges (alias / duplicate_of)
                │
                └──* Observation (append-only, enum-constrained)
                         ▲
DiscoveryReceipt ───* discovery_receipt_candidates (ranked snapshot rows)
         │
         └──* OutcomeReport → diagnostic Observation(s);
              public RelObs only if Verified Agent
```

### 5.0 Resource boundary (locked)

> **Resource** is a **service surface with independent machine-capability semantics**,
> e.g. “OpenAI Developer Documentation”.
> **MCP is an Interface** to that surface — not the Resource itself.

| Is a Resource | Is not a Resource |
| --- | --- |
| OpenAI Developer Documentation | “OpenAI” the company / entire provider |
| DeepWiki public code-explanation surface | A single TCP/HTTPS URL with no capability semantics |
| Cloudflare Docs MCP *surface* (capabilities = docs search) | Every alternate CDN hostname of the same surface as its own Resource |
| Legacy catalog tool that exposes a distinct capability set | An `endpoints` row alone |

**Rules of thumb for V1:**

1. If two Interfaces expose the **same capability semantics for the same audience**, they belong to **one** Resource.
2. If capability semantics differ (docs search vs issue filing vs code execution), prefer **separate** Resources even under one Provider.
3. Endpoint URL changes do **not** mint a new Resource; they mint or update an Interface and/or `resource_external_ids`.
4. Provider is a **party**; Resource is a **surface**.

### 5.1 Resource

Permanent identity is the internal UUID. External identifiers are **not** the primary key.

| Field | Notes |
| --- | --- |
| `id` | **Permanent UUID** — never recycled; sole primary identity |
| `slug` | Public handle; may change with redirect/alias history |
| `resource_type` | enum: `documentation`, `code_index`, `model_hub`, `catalog_tool`, `other` |
| `provider_id` | FK providers (party, not the Resource) |
| `name`, `description` | Human/Agent readable |
| `topics` | text[] or join table |
| `lifecycle` | enum: `pending\|active\|degraded\|deprecated\|suspended\|quarantined` |
| `search_eligibility` | enum: `excluded\|isolated\|searchable` — Registry imports start `isolated` |
| `legacy_tool_id` | nullable unique FK `tools.id` for strangler |
| `merged_into_resource_id` | nullable FK self — soft merge pointer |
| timestamps | created/updated |

**There is no single global `provenance_class` on Resource.** Provenance is recorded per assertion (see §5.1.1 and Observation).

#### 5.1.1 `resource_external_ids`

Maps unstable external identifiers onto the permanent UUID.

| Field | Notes |
| --- | --- |
| `resource_id` | FK |
| `id_system` | enum: `mcp_registry_name`, `npm_package`, `domain_ns`, `legacy_tool_slug`, `endpoint_origin`, `curated_seed_key`, `other` |
| `external_id` | string |
| `is_primary_for_system` | bool |
| `valid_from` / `valid_to` | support migration without breaking history |
| unique | `(id_system, external_id)` where `valid_to` is null |

#### 5.1.2 `resource_sources`

How 404 learned about the Resource (ingest lineage), separate from live Observations.

| Field | Notes |
| --- | --- |
| `resource_id` | FK |
| `source_kind` | enum: `curated_seed`, `legacy_tool_backfill`, `mcp_registry_import`, `provider_register`, `manual_ops` |
| `source_ref` | opaque ref / URL hash / registry version |
| `imported_at` | |
| `isolation_state` | enum: `isolated\|admitted\|rejected` — new Registry rows default **`isolated`** |

#### 5.1.3 `resource_field_provenance`

Field-level (or facet-level) provenance — Resource metadata is a patchwork.

| Field | Notes |
| --- | --- |
| `resource_id` | FK |
| `field_name` | enum allowlist: `name`, `description`, `topics`, `lifecycle`, `capabilities`, … |
| `provenance_class` | same enum as Observation (§8) |
| `source_ref` | |
| `observed_at` / `confidence_band` | enum band, not free float |
| `schema_version` | provenance row format version |

#### 5.1.4 Merge / alias (single authority)

| Mechanism | Role |
| --- | --- |
| **`resources.merged_into_resource_id`** | **Authoritative runtime pointer** — Search/inspect resolve through this column only |
| **`resource_merges`** | **Append-only audit log** of merge operations (who/when/why). Not a second runtime source of truth |
| `resource_slug_history` | optional slug redirects |

**Invariant:** writing a merge updates `merged_into_resource_id` **and** inserts `resource_merges` in one transaction. Readers **must not** consult `resource_merges` to decide current identity. Reversing a merge is a new audited operation that clears/repoints `merged_into_resource_id`, never a silent divergence.

Merges **never** delete the old UUID; Observations stay on original rows; queries follow the authoritative pointer.

### 5.2 ResourceInterface

| Field | Notes |
| --- | --- |
| `id`, `resource_id` | |
| `interface_type` | enum: `mcp_remote`, `http_api`, `a2a`, `other` (**protocol not hardcoded into Resource**) |
| `endpoint_url`, `transport` | transport enum aligned with existing `endpoint_transport` where possible |
| `auth_requirement` | enum: `none\|api_key\|oauth\|other` — V1 default search requires `none` |
| **`access_mode`** | enum: **`unknown\|read_only\|mixed\|write`** — **default `unknown`** |
| `supported_operations` | jsonb with allowlisted keys only |
| `schema_fingerprint` | hash of tools/list (or equivalent) schemas |
| `interface_status` | enum aggregate: `unknown\|active\|degraded\|unavailable` |
| `last_obs_at`, `consecutive_failures` | denormalized from Observations |
| `next_probe_at` | scheduler |
| `legacy_endpoint_id` | nullable unique |
| timestamps | |

**Fail-closed `access_mode` (r2.1 — probe cannot prove read-only):**

`tools/list`, schemas, and `readOnlyHint` are **provider declarations only**. Ordinary probing **cannot prove** absence of side effects.

| Actor | May set / change `access_mode` |
| --- | --- |
| Curated seed / manual ops / explicit verification | **`unknown` → `read_only`** (and other curated assignments) |
| 404 Probe | **May only downgrade**: `read_only` → `unknown` or `mixed` when evidence contradicts (e.g. destructiveHint, write-shaped tools, auth escalation). **Must not** upgrade `unknown` → `read_only` |
| Registry import | Leaves `access_mode=unknown`; row stays **`isolated`** until curated/verified admission |
| Backfill from `verification_checks` | **Never** upgrades to `read_only` |

- Default **`unknown`**. Never default to read-only.
- Default “available now” Search requires `access_mode = read_only` **with** a current Interface assertion whose `assertion_kind` ∈ `{curated_admission, explicit_verification}` (see §5.2.1).
- `mixed` / `write` / `unknown` are hard-excluded from V1 default corpus filters.
- Registry imports therefore remain isolated by default even after successful probe packs (probe alone does not admit).


### 5.2.1 `resource_interface_assertions` (Interface field evidence)

Critical Interface facets are **not** Resource fields. V1 records their evidence on the Interface:

| Field typically asserted | Why Interface-scoped |
| --- | --- |
| `access_mode` | Side-effect posture of this endpoint/transport |
| `auth_requirement` | Auth required at this Interface |
| `schema_fingerprint` | Fingerprint of this Interface’s tools/list (etc.) |
| `supported_operations` | Operations exposed on this Interface |

**Table `resource_interface_assertions`:**

| Column | Notes |
| --- | --- |
| `id` | UUID |
| `interface_id` | FK `resource_interfaces` not null |
| `field_name` | enum allowlist: `access_mode`, `auth_requirement`, `schema_fingerprint`, `supported_operations`, … |
| `field_value` | jsonb or text — normalized asserted value |
| `assertion_kind` | enum: `provider_declared`, `registry_imported`, `probe_observed`, `curated_admission`, `explicit_verification`, `probe_downgrade` |
| `provenance_class` | same enum family as Observation |
| `confidence_band` | `none\|low\|medium\|high` |
| `source_ref` | e.g. observation id, ops ticket |
| `observed_at` | |
| `superseded_at` | nullable — soft versioning; current row has `superseded_at IS NULL` |
| `schema_version` | assertion row format |

**Authority rules for `access_mode` current value:**

1. Write path updates `resource_interfaces.access_mode` **only** from an assertion row.
2. Upgrade to `read_only` requires `assertion_kind ∈ {curated_admission, explicit_verification}`.
3. Probe emits `probe_observed` / `probe_downgrade` assertions; downgrade may update the Interface column; upgrade is rejected by store invariants / tests.
4. `resource_field_provenance` remains for **Resource-level** facets (name, description, topics, lifecycle, …) only.

### 5.3 Capability

| Field | Notes |
| --- | --- |
| `id`, `key` | canonical snake key e.g. `official_docs.search` |
| `display_name`, `description` | |
| `aliases` | table `capability_aliases` |
| `parent_id` | nullable; hierarchy **optional Phase B** |

V1: seed from existing capability strings + curated taxonomy for Coding/Research. `resource_capabilities.source` uses provenance enum, not free text.

### 5.4 Observation (append-only, constrained)

| Field | Constraint |
| --- | --- |
| `id` | UUID |
| `resource_id` | FK not null |
| `interface_id` | FK nullable |
| `observation_type` | **Postgres enum** / check: closed set (§8.2) |
| `status` | **enum**: `pass\|fail\|warn\|error\|success\|failure\|abandoned\|unknown` — subset validated per `observation_type` in app |
| `latency_ms` | int nullable, ≥0 |
| `error_class` | **enum** taxonomy (extend existing telemetry classes); null if N/A |
| `schema_fingerprint` | text nullable |
| `observed_at` | timestamptz not null |
| `provenance_class` | **enum** (§8) not null |
| `evidence_level` | **enum**: `backfill\|probe\|curated\|agent_self_report\|verified_agent` |
| `confidence_band` | **enum**: `none\|low\|medium\|high` — **no unconstrained `real`** |
| `observation_schema_version` | text not null (e.g. `obs_v1`) |
| `agent_key`, `agent_identity_kind`, `workload_class` | privacy-safe; nullable; `agent_identity_kind` enum |
| `evidence_summary` | jsonb — **server-side allowlisted keys only** |
| `evidence_hash` | text nullable |
| `source_ref` | text nullable (e.g. `verification_check:{uuid}`) — see partial unique index §6 |
| `created_at` | default now() |

**Invariants:** append-only (no UPDATE of semantic columns); DB CHECK / enum types; app rejects unknown enum values.

**Backfill idempotency:** for rows with `evidence_level=backfill` and non-null `source_ref`, enforce a **partial unique index** so re-runs cannot duplicate Observations.

### 5.5 DiscoveryReceipt + candidates (critical asset)

Issued by `search_resources`.

**`discovery_receipts`** holds session metadata only — **not** the candidate payload.

| Field | Notes |
| --- | --- |
| `id`, `issued_at`, `expires_at` | short TTL (24–72h) |
| `query_hash` | **Domain-isolated keyed HMAC** (e.g. HMAC-SHA256 over `mcp-discovery-query:v1:` ‖ normalized query+constraints with server secret / `AGENT_ANALYTICS_SALT` class key). **Not** bare SHA of the query string |
| `constraint_fingerprint` | same keyed-HMAC family with distinct domain prefix |
| `algorithm_version` | e.g. `living-index-v1` |
| `outcome_token_hash` | hash of one-time token; **atomically consumed** on first successful report (§5.6 / §12) |
| `outcome_token_consumed_at` | timestamptz null until consumed |
| attribution | same privacy rules as invocations |

**`discovery_receipt_candidates`** — one row per ranked candidate **at issue time** (immutable snapshot):

| Field | Notes |
| --- | --- |
| `receipt_id` | FK |
| `resource_id` | FK |
| `interface_id` | FK — the Interface offered to the Agent |
| `rank` | 1-based position in the returned set |
| `score_total` | numeric |
| `score_components` | jsonb allowlisted: rel, fit, fresh, prov, rel_obs, friction |
| `live_status_snapshot` | enum copy of status shown to Agent |
| `access_mode_snapshot` | enum |
| `matched_capabilities` | text[] or jsonb ids |
| `why_matched` | text[] bounded codes |
| `observation_counts_snapshot` | jsonb |
| `unknowns_snapshot` | text[] bounded codes |
| `observed_at` | receipt issue timestamp (denormalized for analytics) |
| PK | `(receipt_id, rank)` and/or `(receipt_id, resource_id, interface_id)` |

This table is a primary future asset for Exploration Saved, usable@k, and anti-poison audits. **Do not** collapse to `uuid[]`.

**Never store:** full prompt, user content, credentials, tool I/O, PII.

### 5.6 OutcomeReport

Bound to receipt + one-time token.

**Database constraint (required):** composite foreign key

```text
(receipt_id, selected_resource_id, selected_interface_id)
  REFERENCES discovery_receipt_candidates (receipt_id, resource_id, interface_id)
```

Application checks are necessary but **not sufficient**.

**API vs storage statuses:**

| Situation | HTTP/MCP response | DB row |
| --- | --- | --- |
| First valid report | `recorded` | Insert `outcome_reports` (success path only) |
| Token already consumed / duplicate | `already_reported` | **No new row** (or no status column value for this) |
| Invalid token / not in candidates / expired | `rejected` | **No row** |

Do **not** store `already_reported` or `rejected` as `outcome_reports` success statuses. Those are **API response statuses** only.

**Atomic token consumption:** `UPDATE discovery_receipts SET outcome_token_consumed_at=now() WHERE id=$1 AND outcome_token_consumed_at IS NULL AND outcome_token_hash=$2 RETURNING …` in the same transaction as the insert. Concurrent duplicates → one winner, others `already_reported`.

Enums for stored outcome only: `success|failure|abandoned|unknown`; plus `task_category`; `failure_stage`; timings; `exploration_attempts`.

- Always may write **diagnostic** Observations (`evidence_level=agent_self_report`, `confidence_band=low`).
- **Public Living Index RelObs** may incorporate outcomes **only** from **Verified Agent** admissions (§12).

---

## 6. Draft Tables and Critical Indexes

> Additive only. Exact SQL **not** applied in this RFC pass.

```text
-- Enums (illustrative; implement as Postgres ENUMs or CHECK + app Zod)
-- resource_type, lifecycle, search_eligibility, access_mode,
-- interface_status, provenance_class, evidence_level, confidence_band,
-- observation_type, observation_status, error_class, source_kind, id_system

resources (
  id uuid primary key,                     -- permanent identity
  slug text unique not null,
  resource_type resource_type not null,
  provider_id uuid references providers(id),
  name text not null,
  description text not null,
  topics text[] not null default '{}',
  lifecycle lifecycle not null default 'pending',
  search_eligibility search_eligibility not null default 'excluded',
  legacy_tool_id uuid unique references tools(id),
  merged_into_resource_id uuid references resources(id),
  created_at timestamptz not null,
  updated_at timestamptz not null
)
create index on resources (lifecycle, search_eligibility, resource_type);
create index on resources using gin (topics);

resource_external_ids (
  id uuid primary key,
  resource_id uuid not null references resources(id),
  id_system id_system not null,
  external_id text not null,
  is_primary_for_system boolean not null default false,
  valid_from timestamptz not null,
  valid_to timestamptz
)
create unique index on resource_external_ids (id_system, external_id) where valid_to is null;

resource_sources (
  id uuid primary key,
  resource_id uuid not null references resources(id),
  source_kind source_kind not null,
  source_ref text,
  imported_at timestamptz not null,
  isolation_state text not null check (isolation_state in ('isolated','admitted','rejected'))
)
create index on resource_sources (source_kind, isolation_state);

resource_field_provenance (
  id uuid primary key,
  resource_id uuid not null references resources(id),
  field_name text not null,  -- Resource facets only
  provenance_class provenance_class not null,
  source_ref text,
  confidence_band confidence_band not null,
  schema_version text not null,
  observed_at timestamptz not null
)
create index on resource_field_provenance (resource_id, field_name, observed_at desc);

resource_interface_assertions (
  id uuid primary key,
  interface_id uuid not null references resource_interfaces(id),
  field_name text not null check (field_name in (
    'access_mode','auth_requirement','schema_fingerprint','supported_operations'
  )),
  field_value jsonb not null,
  assertion_kind text not null check (assertion_kind in (
    'provider_declared','registry_imported','probe_observed',
    'curated_admission','explicit_verification','probe_downgrade'
  )),
  provenance_class provenance_class not null,
  confidence_band confidence_band not null,
  source_ref text,
  observed_at timestamptz not null,
  superseded_at timestamptz,
  schema_version text not null
)
create index on resource_interface_assertions (interface_id, field_name, observed_at desc)
  where superseded_at is null;

resource_merges (
  from_resource_id uuid not null references resources(id),
  into_resource_id uuid not null references resources(id),
  reason text not null,
  merged_at timestamptz not null,
  primary key (from_resource_id, into_resource_id)
)

resource_interfaces (
  id uuid primary key,
  resource_id uuid not null references resources(id),
  interface_type text not null,
  endpoint_url text not null,
  transport text not null,
  auth_requirement text not null,
  access_mode access_mode not null default 'unknown',  -- FAIL CLOSED
  supported_operations jsonb not null default '{}',
  schema_fingerprint text,
  interface_status interface_status not null default 'unknown',
  last_obs_at timestamptz,
  consecutive_failures int not null default 0,
  next_probe_at timestamptz,
  legacy_endpoint_id uuid unique,
  created_at timestamptz not null,
  updated_at timestamptz not null
)
create unique index on resource_interfaces (resource_id, interface_type, endpoint_url);
create index on resource_interfaces (interface_status, auth_requirement, access_mode);
create index on resource_interfaces (next_probe_at);

capabilities ( ... as before ... )
capability_aliases ( ... )
resource_capabilities (
  resource_id uuid not null,
  capability_id uuid not null,
  provenance_class provenance_class not null,
  primary key (resource_id, capability_id)
)

observations (
  id uuid primary key,
  resource_id uuid not null references resources(id),
  interface_id uuid references resource_interfaces(id),
  observation_type observation_type not null,
  status observation_status not null,
  latency_ms int check (latency_ms is null or latency_ms >= 0),
  error_class error_class,
  schema_fingerprint text,
  observed_at timestamptz not null,
  provenance_class provenance_class not null,
  evidence_level evidence_level not null,
  confidence_band confidence_band not null,
  observation_schema_version text not null,
  agent_key text,
  agent_identity_kind text,
  workload_class text,
  evidence_summary jsonb not null default '{}',
  evidence_hash text,
  source_ref text,
  created_at timestamptz not null default now()
)
-- append-only enforced in app + revoke UPDATE privilege for app role on semantic cols if feasible
create index on observations (resource_id, observed_at desc);
create index on observations (interface_id, observed_at desc);
create index on observations (provenance_class, observation_type, observed_at desc);
-- Backfill idempotency: one Observation per backfill source_ref
create unique index observations_backfill_source_ref_uidx
  on observations (source_ref)
  where evidence_level = 'backfill' and source_ref is not null;

discovery_receipts (
  id uuid primary key,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  query_hash text not null,              -- keyed HMAC, domain-prefixed
  constraint_fingerprint text not null, -- keyed HMAC, distinct domain
  algorithm_version text not null,
  outcome_token_hash text unique not null,
  outcome_token_consumed_at timestamptz, -- null until atomically consumed
  agent_key text,
  agent_identity_kind text,
  client_name text,
  is_external boolean,
  created_at timestamptz not null
)
create index on discovery_receipts (expires_at);

discovery_receipt_candidates (
  receipt_id uuid not null references discovery_receipts(id),
  rank int not null check (rank >= 1),
  resource_id uuid not null references resources(id),
  interface_id uuid not null references resource_interfaces(id),
  score_total numeric not null,
  score_components jsonb not null,
  live_status_snapshot interface_status not null,
  access_mode_snapshot access_mode not null,
  matched_capabilities text[] not null default '{}',
  why_matched text[] not null default '{}',
  observation_counts_snapshot jsonb not null default '{}',
  unknowns_snapshot text[] not null default '{}',
  observed_at timestamptz not null,
  primary key (receipt_id, rank),
  unique (receipt_id, resource_id, interface_id)
)
create index on discovery_receipt_candidates (resource_id, observed_at desc);

outcome_reports (
  id uuid primary key,
  receipt_id uuid not null references discovery_receipts(id),
  -- Only successful accepts are stored. already_reported / rejected are API-only.
  outcome text not null check (outcome in ('success','failure','abandoned','unknown')),
  task_category text not null,
  failure_stage text,
  selected_resource_id uuid not null,
  selected_interface_id uuid not null,
  time_to_first_working_resource_ms int,
  exploration_attempts int,
  created_at timestamptz not null,
  unique (receipt_id),
  foreign key (receipt_id, selected_resource_id, selected_interface_id)
    references discovery_receipt_candidates (receipt_id, resource_id, interface_id)
)
```

Retention: Observations and receipt candidates default append/immutable; cold archive later. Do not delete candidates to “fix” metrics.

---

## 7. Resource Identity and Dedup

**Goal:** One Resource per distinct service surface; many Interfaces; permanent UUID survives URL and registry churn.

### 7.1 Identity model (replaces unstable `canonical_key` PK)

1. **Primary key:** `resources.id` UUID — permanent, never derived from domain/path/slug.
2. **`resource_external_ids`:** all unstable names (registry name, npm, domain+ns, legacy slug, endpoint origin) as **secondary** keys with validity windows.
3. **`resource_sources`:** ingest lineage + isolation.
4. **`resource_merges` / `merged_into_resource_id`:** explicit consolidation when two UUIDs are later judged the same surface.

### 7.2 Dedup / match procedure (ingest)

When a new Interface or registry row arrives:

1. Lookup active `resource_external_ids` by strongest available system (curated_seed_key → mcp_registry_name → legacy_tool_slug → endpoint_origin).
2. If hit → attach Interface to existing Resource (or update URL on Interface).
3. If miss → create **new** Resource UUID + external id rows; set `search_eligibility=isolated` for Registry imports.
4. **Never** auto-merge across different verified providers.
5. Ops/curated merge writes `resource_merges` and sets `merged_into_resource_id`; Search resolves to survivor.

Endpoint migration (same surface, new host): add/replace Interface; keep Resource UUID; add new `endpoint_origin` external id with `valid_from`; close old origin `valid_to`.

### 7.3 V1 corpus admission (hard — fail closed)

Default Search (“available now”) includes a Resource **only if all** hold:

- `search_eligibility = searchable`
- `lifecycle ∈ {active, degraded}`
- ≥1 Interface with remote MCP transport
- `auth_requirement = none`
- **`access_mode = read_only`** via current `resource_interface_assertions` with `assertion_kind ∈ {curated_admission, explicit_verification}` — **never** from probe alone
- `interface_status ∈ {active, degraded}` — **`unknown` excluded**
- Endpoint passes SSRF public unicast rules
- For Registry-originated rows: `isolation_state` → `admitted` only after **curated/explicit verification** of `access_mode` (probe success alone is insufficient)

Isolated imports are visible to ops/importers, **not** to default `search_resources`.

---

## 8. Observation Provenance and Trust Levels

| `provenance_class` | Meaning | Public Living Index weight |
| --- | --- | --- |
| `provider_declared` | Publisher metadata | Low (Friction/unknowns only) |
| `registry_imported` | Third-party registry scrape | Low; **never** grants `access_mode=read_only` or search admission |
| `404_observed` | 404 Probe | **Primary** reliability/freshness |
| `agent_self_reported` | Any non-verified outcome | **Diagnostic only** — weight **0** in public RelObs |
| `verified_agent_reported` | Outcome from Verified Agent admission | Eligible for public RelObs after thresholds |
| `independently_verified` | Reserved | Empty in V1 unless explicitly mapped |

### 8.1 Confidence

Use **`confidence_band` enum** only (`none|low|medium|high`). Mapping examples:

| Evidence | Band |
| --- | --- |
| Historical `verification_checks` backfill | `low` or `medium` max (shallow schema_consistency) |
| Fresh successful probe pack | `high` for probe-typed observations; may **downgrade** access_mode only |
| Curated / explicit verification of access_mode | `high` — **sole** path to `read_only` |
| Anonymous / unverified Agent outcome | `low` + public weight 0 |
| Verified Agent outcome | `medium` until N-agent threshold, then eligible |

### 8.2 Closed `observation_type` set (V1)

`probe_dns_tls`, `probe_mcp_init`, `probe_tools_list`, `probe_schema_fingerprint`, `probe_latency`, `probe_auth_signal`, `schema_change`, `access_mode_downgrade`, `registry_import`, `curated_admission`, `explicit_verification`, `agent_outcome`, `lifecycle_transition`

Adding a type requires migration + `observation_schema_version` bump — not silent string inserts.

### 8.3 Backfill rules

- `verification_checks` → `404_observed` + `evidence_level=backfill` + `confidence_band≤medium`
- `source_ref = 'verification_check:' || id` with **partial unique index** (idempotent re-runs)
- Do **not** invent `independently_verified` or `verified_agent_reported`
- Do **not** set `access_mode=read_only` from backfill or probe; curated seeds that were admitted as read-only must write a `curated_admission` Interface assertion explicitly during backfill of those seeds only

---

## 9. Contract Drafts: `search_resources` / `inspect_resource` / `report_resource_outcome`

MCP names are **locked** to avoid colliding with host built-in Search and other MCP tools:

| MCP tool | REST |
| --- | --- |
| `search_resources` | `POST /v1/resources/search` |
| `inspect_resource` | `GET /v1/resources/:idOrSlug` |
| `report_resource_outcome` | `POST /v1/resources/outcomes` |

### 9.1 `search_resources`

**Request**

```json
{
  "query": "I need current documentation for an unfamiliar cloud API",
  "constraints": {
    "protocol": ["mcp"],
    "authentication": ["none"],
    "access_mode": ["read_only"],
    "require_fresh": true,
    "max_results": 5,
    "task_category": "research_docs"
  }
}
```

**Defaults (fail closed):** `authentication=["none"]`, `access_mode=["read_only"]`, `require_fresh=true` ⇒ exclude `interface_status=unknown` and `access_mode=unknown`.

**Response (Candidate Set — never single “best”)**

```json
{
  "receipt_id": "uuid",
  "outcome_token": "once",
  "algorithm_version": "living-index-v1",
  "candidates": [
    {
      "resource": { "id": "", "slug": "", "name": "", "type": "documentation" },
      "why_matched": ["capabilities: official_docs.search", "topics: aws"],
      "matched_capabilities": ["official_docs.search"],
      "interface": {
        "id": "",
        "type": "mcp_remote",
        "endpoint": "https://…",
        "auth": "none",
        "access_mode": "read_only"
      },
      "live_status": "active|degraded",
      "last_checked_at": "ISO-8601",
      "data_sources": ["404_observed", "curated_seed"],
      "observation_counts": { "probe_7d": 12, "verified_outcome_7d": 0 },
      "known_limits": ["schema_fingerprint_shallow"],
      "unknowns": ["client_compat:cursor:untested"],
      "scores": {
        "total": 0.0,
        "relevance": 0.0,
        "operational_fit": 0.0,
        "freshness": 0.0,
        "provenance": 0.0,
        "observed_reliability": 0.0,
        "friction": 0.0
      },
      "pareto_tags": ["best_freshness"]
    }
  ],
  "ranking_notice": "Candidate set ranked for exploration cost under hard constraints; not a safety or quality guarantee. Trust v1 overall is legacy and not used here."
}
```

Each returned candidate is persisted as a **`discovery_receipt_candidates`** row (§5.5).

### 9.2 `inspect_resource`

Input: `resource_id` or `slug` (+ optional `interface_id`). Follows `merged_into_resource_id` when present.

Returns: identity (UUID + external ids), capabilities, interfaces, auth, **access_mode**, current aggregate state, field-level provenance summary, recent Observations (bounded N), schema/version change events, compatibility evidence, unknowns. **No live probe wait** (optional `request_probe=true` enqueues only).

### 9.3 `report_resource_outcome`

Requires `receipt_id` + `outcome_token` + bounded enums. Selection must exist in `discovery_receipt_candidates` (**enforced by composite FK**).

Responses: `recorded` | `already_reported` | `rejected` — last two are **API-only** (no `outcome_reports` row).

Token consumption is **atomic** with insert (§5.6). Concurrent duplicates → single `recorded`.

- Writes diagnostic Observation (`agent_self_reported`, weight 0 for public rank) for all callers.
- Public RelObs update path runs **only** when caller is a **Verified Agent** (§12).

---

## 10. Search Filtering and Ranking

### 10.1 Pipeline

1. **Hard filter** (cannot be score-compensated): protocol, auth∈allowed, read_only, lifecycle/live_status, corpus admission, max_results.
2. **Retrieve** lexical candidates (Phase A).
3. **Score** Living Index v1.
4. **Explain** + optional Pareto tags (relevance vs freshness vs reliability).

### 10.2 Living Index v1

\[
Score(r \mid q,c) = Rel + Fit + Fresh + Prov + RelObs - Friction
\]

| Component | Phase A signal | Notes |
| --- | --- | --- |
| Relevance | lexical-v2 weights on Resource fields + capability keys | Keep all-terms-required or move to FTS OR with explicit mode flag |
| OperationalFit | constraint match: `access_mode=read_only`, auth none, protocol, task_category↔capabilities | `access_mode=unknown` ⇒ exclude (default) |
| Freshness | time since last successful `404_observed` probe | Stale ⇒ penalty; never invent freshness |
| Provenance | field-level + interface observation mix — **not** one Resource-global class | Declared/registry ≪ 404_observed |
| ObservedReliability | probe success + **Verified Agent** outcomes only | Self-reports diagnostic-only |
| Friction | auth friction, schema change recency, consecutive_failures, unknowns count | |

**Forbid:** paid boost; treating Trust overall as P(safe); treating unknown as available.

### 10.3 Retrieval technology (phased)

| Tech | Now (Phase A) | Later |
| --- | --- | --- |
| App-level lexical-v2 | **Yes** — proven, tested | Keep as explainable baseline |
| PostgreSQL FTS (`tsvector`) | **Not a Phase 1 prerequisite**; complete before ~**500** searchable Resources | Primary retrieve when scale needs it |
| `pg_trgm` | Optional for typo tolerance on names | Yes with FTS |
| embeddings / pgvector | **No** for V1 launch | Phase C after benchmark shows lexical ceiling |

Search p95 &lt; 500ms assumption: precomputed interface status + indexed retrieve; **never** await probe.

---

## 11. Live Probe and State Aggregation

### 11.1 V1 probe pack (public remote MCP only)

DNS/TLS → MCP initialize → tools/list → schema fingerprint → auth/capability change detect → latency/error class → record Observation(s) → update interface aggregate → lifecycle transition.

### 11.2 Scheduler

Reuse lease pattern (`claimToolsForVerification` → `claimInterfacesForProbe`):

| Concern | Design |
| --- | --- |
| Priority | Hot (recent search/receipt) &gt; failing streak investigation &gt; cold |
| Freshness tiers | Hot 15–30m; warm 2–6h; cold 24h |
| Backoff | Keep 5m × 2^n ≤ 24h |
| Concurrency | SKIP LOCKED + global and per-host limits |
| Rate limit / politeness | per-host token bucket; jitter; Respect future `robots`/operator deny list |
| SSRF | existing `resolvePublicHttpUrl` + pinned fetch |
| Schema change | fingerprint delta → Observation `schema_change` + bump Friction |
| Degraded/unavailable | consecutive failures + severity (TLS fail ≠ timeout) |

Search reads **aggregates** (`interface_status`, `last_success_at`, `consecutive_failures`), not raw scan.

---

## 12. Anti-poisoning and Privacy

### 12.1 Why `POST /v1/receipts` is disabled (code)

Anonymous unverifiable outcomes poison Trust/usage. V1 **does not** re-open that path. `report_resource_outcome` requires:

1. Server-issued DiscoveryReceipt + hashed one-time token  
2. Short TTL  
3. Selected resource/interface ∈ `discovery_receipt_candidates` — **composite FK** + app check  
4. **Atomic** `outcome_token_consumed_at` update (prevents concurrent double submit)  
5. Rate limits per `agent_key` / IP class; quotas; burst quarantine  
6. **Public RelObs:** **Verified Agent admissions only**. HMAC-only or anonymous → diagnostic only  
7. `query_hash` / constraint fingerprints use **keyed HMAC** with domain separation (not raw SHA of query text)  
8. Self-report `evidence_level` always labeled; never silently becomes `404_observed`

### 12.2 Privacy

Store HMAC agent keys only; no prompts; Observation `evidence_summary` allowlisted keys only; session keys remain HMAC (`session_key` privacy migration 0006).

### 12.3 Identity classes stay partitioned

internal / known non-user / anonymous / explicit / **verified-admission** — separate metrics and rank eligibility (extend `evaluation-metric-scopes` tests). Only verified-admission feeds public RelObs.

---

## 13. Legacy Compatibility Plan

| Surface | Policy |
| --- | --- |
| MCP tool names (16) | Remain; add `search_resources` / `inspect_resource` / `report_resource_outcome` |
| `GET /v1/tools/search` | Continues; may dual-read Resources behind flag |
| Risk/PM routes | Unchanged |
| Homepage | Keep Polymarket CTA until Search **passes Benchmark**; then demote |
| Gateway `invoke_registered_tool` | **Compatibility only** — remove from primary instructions/main path |
| Trust v1 / `get_trust_score` | **Frozen** algorithm; responses mark `legacy: true` |
| npm bridge / Registry | Version bump when new tools ship |
| Rollback binary | Cloud Run **`directory-404-v0103-f974214`** (v0.10.3) |
| Dev branch | Implementation only from clean branch off **`origin/main`** |

Strangler: Feature flags `RESOURCE_INDEX_READ`, `RESOURCE_INDEX_WRITE`, `LIVING_INDEX_SEARCH`.

---

## 14. Additive Migration Sequence

| Step | Change | Rollback |
| --- | --- | --- |
| M1 | Create Resource* tables (empty) | Drop new tables only |
| M2 | Dual-write on tool register/seed → Resource+Interface | Disable write flag |
| M3 | Backfill job tools→resources, endpoints→interfaces | Idempotent; delete backfill rows by `legacy_*` |
| M4 | Backfill verification_checks→observations (capped confidence) | Delete by `source_ref` prefix |
| M5 | Probe worker writes Observations (+ keep verification_checks dual-write) | Worker flag |
| M6 | Ship `inspect_resource` (read new tables) | Route flag |
| M7 | Ship `search_resources` Living Index (flagged) | Flag off → lexical tools |
| M8 | Ship `report_resource_outcome` | Flag off |
| M8b | Registry importer → `search_eligibility=isolated` until probe admits | Importer flag |
| M9 | Legacy search dual-read | Flag |
| M10 | Stop dual-write to old verification only when stable | Re-enable dual-write |

**Never** rename/drop `tools` in V1.

---

## 15. Backfill and Dual-write

### 15.1 Dual-write points

- `registerTool` / `ensureTool` / seeds  
- `insertVerificationCheck` + `completeVerificationAttempt`  
- (Optional) `recordInvocation` → observation with provenance by identity  

### 15.2 Backfill integrity

- Map 1 tool → 1 resource (`legacy_tool_id` unique).  
- Historical checks: `provenance=404_observed`, `evidence_level=backfill`, confidence ≤ 0.7.  
- Do **not** set `independently_verified`.  
- `usage_receipts` historical rows: **do not** auto-promote to OutcomeReport.  
- Job is idempotent and dry-run capable.

---

## 16. Rollback Plan

1. **App:** set flags off; traffic remains on Tool APIs.  
2. **Worker:** disable Observation writer; verification-only.  
3. **DB:** new tables retain data (forward-compatible); no destructive down migration required for emergency.  
4. **Deploy:** Cloud Run rollback to **`directory-404-v0103-f974214`**.  
5. **Client:** old MCP tool list without new tools still valid.

Each phase (§14) independently reversible.

---

## 17. Benchmark Design

### 17.1 Discovery Tasks

Start **≥30**, expand to **100**, Coding + Research only. Examples:

- Find read-only MCP for current AWS/Azure/GCP/Cloudflare docs  
- Find code-explanation wiki for public GitHub repo docs  
- Find HF model card / hub search MCP  
- Recover from stale endpoint (fixture)  
- Auth-required distractor must be filtered  

### 17.2 Protocol

Same model + Web/Search/Browser **vs** same + 404 (`search_resources` / `inspect_resource` / `report_resource_outcome`). Blind task rubrics; no cherry-picked demos as proof.

### 17.3 Metrics

| Metric | Definition |
| --- | --- |
| Task completion rate | Judge/scripted success |
| Exploration calls | HTTP/tool calls until working resource |
| Failed integrations | Schema/auth/invoke failures |
| Tokens spent discovering | Provider token counters |
| Time-to-first-working-resource | Clock |
| usable@1 / usable@3 | Candidate quality |
| stale-result rate | Ranked “active” but probe-fail within window |
| Total discovery cost | Time + tokens + calls |
| **North Star: Successful Discovery Rate** | Completions / tasks |
| **Value: Exploration Saved** | Δ exploration calls/tokens/time vs control |

---

## 18. Metrics and Kill Criterion

### 18.1 Product metrics (not vanity)

- Successful Discovery Rate (benchmark + production receipts **eligible**)  
- Exploration Saved (benchmark primary; production secondary)  
- stale-result rate  
- Probe coverage / freshness SLO  
- Outcome report rate **with** anti-poison eligibility  
- Legacy regression: `search_tools` parity smoke  

**Do not** use pageviews, installs, `tools/list` counts, or GitHub stars as success.

### 18.2 Continue criteria (V1)

All required:

1. Benchmark: Experimental Successful Discovery Rate **≥ control + 15 absolute points** on ≥30 tasks **or** Exploration Saved median **≥ 30%** with non-inferior completion.  
2. stale-result rate on held-out probes **≤ 10%**.  
3. Search p95 &lt; 500ms; inspect p95 &lt; 300ms (no live probe) in staging load.  
4. Zero Sev-1 legacy breaks on Tool/Risk/PM paths during dual-track.  
5. Public RelObs invariant: **only Verified Agent outcomes** may move rank; all other reports diagnostic-only (tests).

### 18.3 Kill / pivot criteria

Any of:

1. After 100-task suite, no significant Exploration Saved and no SDR lift.  
2. Agents still succeed mainly via gateway invoke of the same 6 seeds — index not used.  
3. Poisoning or SSRF incident from probe/outcome design.  
4. Ops cost of probing exceeds team capacity without automation (cannot maintain freshness).  

Then: freeze Resource Index read flags; keep v0.10.3-compatible Tool+vertical product; rewrite RFC.

---

## 19. Test Strategy

| Layer | Additions |
| --- | --- |
| Unit | Living Index scoring fixtures; hard-filter cases; provenance weights; receipt token; schema fingerprint stability |
| Store | PG backfill idempotency; append-only Observation invariant |
| HTTP/MCP | New three tools + legacy parity (`catalog-search*.test.ts` remain green) |
| Worker | Probe Observation emission; lease; backoff; SSRF fixtures |
| Security | Anti-poison attempts; rate limits |
| Eval | New `evals/discovery-tasks/` replacing reliance on 0.4.x tool-selection as product proof |
| Metrics | Extend `evaluation-metric-scopes` for outcome eligibility |

---

## 20. Phased Implementation Tasks

> Still **design-only until r2 ACK**. Each item: files, deps, acceptance, risk, blocking.

### Phase 0 — Decisions, branch hygiene (non-coding / docs only)

| ID | Task | Files | Deps | Acceptance | Risk | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P0.1 | Close Open Questions → Decision Log | this RFC | — | §22/§23 match product ACK | Scope drift | All |
| P0.2 | Create clean branch from `origin/main` | git only | P0.1 ACK | Worktree ≠ `release/v0.10.0` | Wrong baseline | P1 |
| P0.3 | Record rollback revision `directory-404-v0103-f974214` in runbook | ops doc | P0.2 | Documented | Wrong rollback | Deploy |

### Phase 1 — Additive schema + domain types

| ID | Task | Files | Deps | Acceptance | Risk | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P1.1 | Drizzle enums + tables §6 (incl. external_ids, sources, field provenance, receipt candidates) | `src/db/schema.ts`, `drizzle/0010_*.sql` | P0 | Empty migrate on staging | Lock contention | P2+ |
| P1.2 | Domain types + Zod with closed enums / confidence_band | `src/domain/types.ts`, new `resource-*.ts` | P1.1 | Typecheck; reject free `confidence` float | Over-coupling to Tool | P2 |
| P1.3 | Store methods | `store.ts`, `postgres-store.ts`, `memory-store.ts` | P1.2 | Memory+PG tests; append-only Observation | Interface bloat | P2 |

### Phase 2 — Dual-write + backfill + importer shell

| ID | Task | Files | Deps | Acceptance | Risk | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P2.1 | Dual-write curated seeds + legacy tools | `seed-*.ts`, register paths | P1 | 6 curated + first-party Resources; `access_mode` curated or unknown | Wrong Resource grain | P3 |
| P2.2 | Backfill job + external_ids | `scripts/backfill-resources.ts` | P2.1 | Idempotent dry-run | Bad merges | P3 |
| P2.3 | Checks→Observations (banded confidence) | verification insert path | P1 | Dual rows; no access_mode auto-promote | Rank pollution | P4 |
| P2.4 | Registry importer (isolated default) | new importer module | P1 | Imports land `isolated`; not in default search | SSRF / junk flood | P3 |

### Phase 3 — Probe → Observation + access_mode admission

| ID | Task | Files | Deps | Acceptance | Risk | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P3.1 | Fingerprint + change events | `verification.ts` | P2.3 | Fingerprint stable | False schema churn | P4 |
| P3.2 | Scheduler tiers / per-host limits | worker + store claim | P3.1 | Politeness tests | Ban from targets | P4 |
| P3.3 | Probe may **downgrade** `access_mode` only; curated/explicit verification admits `read_only` + isolated→searchable | worker + store + assertions | P3.1 | Invariant tests: probe cannot upgrade | Premature admission | P4 |

### Phase 4 — Agent surface

| ID | Task | Files | Deps | Acceptance | Risk | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P4.1 | `inspect_resource` | `discovery-tools.ts`, `v1-routes.ts` | P2 | Contract tests | Info leak | P4.2 |
| P4.2 | `search_resources` Living Index + candidate rows | `living-index.ts`, receipts | P3, P4.1 | Explainable scores; candidate table filled | Regress legacy search | P4.3 |
| P4.3 | `report_resource_outcome` | outcomes | P4.2 | Verified-only public RelObs tests | Re-open poisoning | Benchmark |
| P4.4 | Legacy adapters; demote invoke in instructions | `create-server.ts`, homepage later | P4.2 | Flag off = old behavior | Subtle rank change | — |
| P4.5 | FTS (when approaching ~500 searchable Resources) | schema + search | P4.2 | p95 still &lt;500ms | Premature complexity | Scale |

### Phase 5 — Product copy & vertical demotion

| ID | Task | Files | Deps | Acceptance | Risk | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P5.1 | Brand = Search Layer in MCP/docs | `create-server.ts`, docs | P4 + P6 gate | Instructions lead with search_resources | Confuse Agents | Growth |
| P5.2 | Demote Polymarket homepage CTA | `homepage.ts` | **After Benchmark pass** | CTA order updated | Early demotion | Growth |
| P5.3 | Mark Trust v1 legacy in API | trust responses | P1 | `legacy: true` + frozen algorithm | Clients over-trust | — |
| P5.4 | ADR 0004 accepted | `docs/adr/` | P0 | ADR links this RFC | Doc drift | — |

### Phase 6 — Benchmark gate

| ID | Task | Files | Deps | Acceptance | Risk | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P6.1 | 30 discovery tasks | `evals/discovery-tasks/` | P4 | Suite runs | Flaky live net | Launch |
| P6.2 | Kill/continue review | report | P6.1 | Written go/no-go | Vanity metrics | GA + P5.2 |

---

## 21. Explicitly Deferred Features

- Defaulting unknown Interfaces to `read_only`
- OAuth, API keys, paid resources, secrets  
- Universal execution router / arbitrary invoke as core  
- OpenAPI web-scale index  
- Vector search as default retrieve  
- Graph database / capability hierarchy UX  
- Best-of leaderboards / sponsored rank  
- Auto-promoting Agent outcomes to high trust  
- Deleting Tool/Risk/PM tables  
- New Agent wire protocol  

---

## 22. Open Questions — resolved

| # | Question | Decision |
| --- | --- | --- |
| 1 | Corpus bootstrap | **Backfill current 6 curated (+ first-party map)** now; **build Registry importer** in parallel; imports default **`isolated`** until probe/curated admission |
| 2 | Gateway invoke | **Demote to compatibility**; remove from primary Agent flow / instructions |
| 3 | `live_status=unknown` | **Excluded** from default “available now” results (`require_fresh=true`) |
| 4 | Outcome → public rank | **Verified Agent outcomes only**; all other feedback diagnostic |
| 5 | Legacy Trust | **Freeze Trust v1**; mark **legacy** in responses; not Living Index input |
| 6 | Polymarket homepage CTA | Demote **only after** Search passes Benchmark |
| 7 | FTS | **Not Phase 1 prerequisite**; finish before ~**500** searchable Resources |
| 8 | NFR | 100k / 10M = **capacity assumptions**; p95 = **test gates**; 99.9% = **post-Beta production target** |
| 9 | Branch hygiene | **Must** cut clean branch from **`origin/main`** before coding |
| 10 | MCP names | **`search_resources`**, **`inspect_resource`**, **`report_resource_outcome`** |

Product architecture ACK'd. Remaining: commit r2.1 on clean `origin/main` worktree → **Phase 1 DB ACK**. Rollback revision frozen as `directory-404-v0103-f974214`.

---

## 23. Decision Log

| ID | Decision | Status |
| --- | --- | --- |
| D1 | Brand = Search Layer for the Agent Web | **Accepted** |
| D2 | V1 users = Coding + Research Agents | **Accepted** |
| D3 | V1 corpus = public remote MCP, auth=none, `access_mode=read_only` via curated/explicit verification | **Accepted** (clarified r2.1) |
| D4 | New surface = `search_resources` / `inspect_resource` / `report_resource_outcome` | **Accepted** |
| D5 | Strangler dual-track; no big-bang | **Accepted** |
| D6 | Risk/Trust/PM = support/vertical, not brand core | **Accepted**; ADR update pending implementation |
| D7 | Observation append-only + provenance weights | **Accepted** |
| D8 | Living Index = Rel+Fit+Fresh+Prov+RelObs−Friction | **Accepted** |
| D9 | Phase A: no vector DB; lexical first; FTS before ~500 Resources | **Accepted** |
| D10 | Anonymous/unverified outcomes cannot move public rank | **Accepted** (strengthened: Verified Agent only) |
| D11 | Production rollback baseline = v0.10.3 | **Accepted** |
| D12 | Phase 1 coding blocked until r2 ACK + `origin/main` branch | **Accepted** |
| D13 | Resource = service surface with independent machine-capability semantics; MCP = Interface | **Accepted (r2)** |
| D14 | Permanent UUID identity + `resource_external_ids` / `resource_sources` / merges — no unstable `canonical_key` PK | **Accepted (r2)** |
| D15 | `access_mode` enum default **`unknown`** (fail closed); never default read_only | **Accepted (r2)** |
| D15a | Probe **cannot** upgrade to `read_only`; only curated/explicit verification can; probe may downgrade | **Accepted (r2.1)** |
| D16 | `discovery_receipt_candidates` row-per-candidate snapshots (not `uuid[]`) | **Accepted (r2)** |
| D17 | Observation uses DB enums + `confidence_band` + `observation_schema_version`; field-level provenance on Resource | **Accepted (r2)** |
| D18 | Registry importer ships isolated-by-default | **Accepted** |
| D19 | Trust v1 frozen + legacy marker | **Accepted** |
| D20 | Polymarket homepage demotion after Benchmark gate | **Accepted** |
| D21 | `invoke_registered_tool` compatibility-only | **Accepted** |
| D22 | `resource_interface_assertions` for Interface-scoped evidence (`access_mode`, auth, schema, ops) | **Accepted (r2.1)** |
| D23 | `outcome_reports` composite FK to `discovery_receipt_candidates`; `already_reported`/`rejected` are API-only | **Accepted (r2.1)** |
| D24 | `query_hash` = domain-keyed HMAC; outcome token atomically consumed; backfill `source_ref` partial unique | **Accepted (r2.1)** |
| D25 | Merge authority = `merged_into_resource_id` only; `resource_merges` is audit log | **Accepted (r2.1)** |
| D26 | Production rollback revision = `directory-404-v0103-f974214` | **Accepted (r2.1)** |

---

## Appendix A — Docs ↔ code mismatches

1. Brand/docs/ADR center Risk/Polymarket; this RFC retargets Search Layer.  
2. ADR 0002 Accepted vs README Superseded.  
3. `agents` table unused.  
4. `schema_consistency` is shallow; must not be sold as deep schema audit.  
5. Evals at 0.4.x; product at 0.10.3.  
6. Two “receipt” concepts: usage `POST /v1/receipts` (disabled) vs risk/PM evaluation receipts (live).  
7. Local worktree `release/v0.10.0` ≠ audit tag `v0.10.3` / `origin/main` — **must not** be the implementation base.

## Appendix B — Design correction checklist

### r2 (product architecture)

| # | Issue | Resolution |
| --- | --- | --- |
| 1 | Resource grain unclear | §5.0 locked definition + examples |
| 2 | Unstable `canonical_key` | §7 permanent UUID + external_ids/sources/merges |
| 3 | `read_only default true` | `access_mode` default `unknown` |
| 4 | `candidate_resource_ids uuid[]` | `discovery_receipt_candidates` table |
| 5 | Loose Observation types | Enums, confidence_band, schema_version, field provenance |

### r2.1 (Phase 1 DB blockers)

| # | Issue | Resolution |
| --- | --- | --- |
| 1 | Probe upgrading to `read_only` | Curated/explicit verification only; probe downgrade-only (§5.2, P3.3) |
| 2 | Interface evidence on Resource table | `resource_interface_assertions` (§5.2.1) |
| 3 | Outcome without DB candidate constraint | Composite FK; API-only `already_reported`/`rejected` (§5.6) |
| 4 | Privacy / idempotency gaps | Keyed HMAC query_hash; atomic token; backfill partial unique; merge authority (§5.1.4, §6, §12) |

## Appendix C — Stop conditions for this engagement

- RFC **r2.1** written under `docs/rfc/RFC-0004-search-layer-for-agent-web.md`  
- **No** business code, migrations, or production config changed in the old worktree  
- Next: **new independent worktree from `origin/main`** → commit RFC only → then product may ACK Phase 1 DB  
- Do **not** `git clean` the shared worktree (untracked SDK build artifacts must be preserved)  
- Do **not** develop Phase 1 on `release/v0.10.0`  

---

*End of RFC-0004 (r2.1).*
