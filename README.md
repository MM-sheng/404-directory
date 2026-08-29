# 404.directory

**Risk preflight for AI Agent actions.**

404.directory gives AI Agents an evidence-backed `allow`, `review`, or `block`
decision before they install or invoke a third-party tool. Discovery, provider
verification, live checks, privacy-safe usage evidence, and a curated read-only
MCP gateway support that decision.

The first vertical decision workflow evaluates Polymarket settlement wording,
timing, public order-book liquidity, caller-observed eligibility, and execution
mode before an Agent contemplates a Yes/No action. It never predicts the winner
or places an order.

Connect a real Agent in under a minute (Codex, Cursor, Claude Code, or MCP SDK):
https://404.directory/connect?source=github

External users can join the first-10 activation pilot and report only the
client, task category, and failure stage:
https://github.com/MM-sheng/404-directory/issues/1

Agent-readable installation instructions: [`llms-install.md`](./llms-install.md)

Install the Agent Skill in Codex, Claude Code, Cursor, Cline, or another Agent
Skills client:

```bash
npx skills add MM-sheng/404-directory --skill use-404-directory -g -y
```

The repository also conforms to Agent Plugins 1.0: compatible clients discover
the Agent Skill from `skills/` and an identity-preserving bridge to the hosted
Streamable HTTP server from the root `mcp.json`. The bridge creates one random
ID in the client-managed `PLUGIN_DATA` directory. The raw ID stays local; the
service stores only an HMAC digest after a successful tool call.

Claude Code and Cowork use the native manifest in `.claude-plugin/`. It loads
the same Skill and identity-preserving bridge with Claude's persistent plugin
data directory, so updates keep the installation identity stable.

Install it directly in Claude Code while the official directory submission is
under review:

```text
/plugin marketplace add MM-sheng/404-directory
/plugin install 404-directory@404-directory
```

## Product layers

| Layer                           | Purpose                                              | Surface                                                                                                            |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **First-party execution**       | Run first-party tools in this process                | `GET /tools`, `POST /understand`, `POST /verify/web`, MCP tools                                                    |
| **Curated remote execution**    | Search and call approved read-only remote MCP tools  | MCP `search_official_docs` / `inspect_tool_server` / `invoke_registered_tool`                                      |
| **Ecosystem catalog + trust**   | Register / verify / trust / search third-party tools | `/v1/*`, MCP `search_tools` / `get_tool` / `compare_tools` / `get_trust_score`                                     |
| **Contextual risk preflight**   | Decide whether an Agent should proceed now           | MCP `evaluate_tool_risk` / `report_tool_outcome`, REST `/v1/evaluations/*`                                         |
| **Prediction-market preflight** | Check settlement and execution risk before action    | MCP `evaluate_prediction_market` / `report_prediction_market_outcome`, REST `/v1/prediction-markets/evaluations/*` |

The current product is intentionally narrow: preflight one prediction-market
decision or one registered third-party tool action, then capture a bounded
outcome. Future identity, reputation, guarantee, and insurance layers remain
hypotheses until real external Agent usage validates them.

## Current first-party tools

| Tool                 | Endpoint           | When to use                                                                        |
| -------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `understand_webpage` | `POST /understand` | Understand an ordinary webpage (entities, state, actions) with no Agent-native API |
| `verify_web`         | `POST /verify/web` | Independently verify a public site after a deploy/update claim                     |

## Agent Discovery API (`/v1`)

Requires a catalog backend (`DATABASE_URL` Postgres, or in-memory fallback when
`CATALOG_MEMORY_FALLBACK=true`).

```bash
# Bootstrap admin token (required in production; auto-generated in local/dev)
export REGISTRY_ADMIN_TOKEN=change-me-to-a-long-secret

# Register a tool (pending quarantine until ownership + protocol verification)
curl -sS http://127.0.0.1:4040/v1/tools \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $REGISTRY_ADMIN_TOKEN" \
  -d '{
    "name":"btc_analyzer",
    "description":"Analyze BTC market signals for agents",
    "capabilities":["btc","market-analysis"],
    "protocol":"mcp",
    "endpoint":"https://example.com/mcp",
    "category":"finance",
    "provider":{"name":"Example Labs","identity":{"type":"domain","value":"example.com"}}
  }'
# Response includes provider_api_key once — store it for ownership + further writes.

# Search (active tools only)
curl -sS 'http://127.0.0.1:4040/v1/tools/search?capability=btc&trust_threshold=0.2'

# Trust profile
curl -sS http://127.0.0.1:4040/v1/tools/btc_analyzer/trust
```

Catalog keyword search uses `catalog-lexical-v2` in both memory and PostgreSQL.
Try `q=official%20documentation` or `q=OpenAI%20docs`; words need not be adjacent.
All meaningful terms must match across the name, description, capabilities,
category or provider. Exact names rank first, then lexical relevance, existing
trust evidence and usage. Capability/protocol/category/trust filters remain
mandatory, and public search still excludes quarantined and suspended tools.

No matches returns `count: 0`, `search.result_status: "no_matches"`, and a
recovery step pointing to MCP `list_capabilities` / REST `/v1/capabilities`.
An empty MCP search is a valid response, but is recorded as `no_matches` rather
than a successful Agent activation. It does not mean the task is impossible.
Search neither executes tools nor proves they are safe; preflight the exact
chosen slug. See [search semantics and acceptance results](docs/AUDIT_SEARCH_RECALL_2026-08-27.md).

Trust Profile dimensions (v1 algorithm, extensible factors JSON):

- Ownership / Availability / Compatibility / Security / Usage → `overall_score`

Contextual preflight is available through `POST /v1/evaluations`; public
receipts are readable at `GET /v1/evaluations/:id`. One bounded outcome can be
attached through `POST /v1/evaluations/:id/outcome` using the one-time token
returned at evaluation time. Only the token hash is stored, and self-reported
outcomes never directly increase Trust. The older generic `POST /v1/receipts`
remains disabled because unbound anonymous submissions would poison Trust.

Copy-ready Agent trigger policy and examples:
[`docs/AGENT_RISK_PREFLIGHT.md`](./docs/AGENT_RISK_PREFLIGHT.md)

Privacy-safe product validation is public at
`GET /v1/metrics/risk-evaluations`: evaluation volume, decision distribution,
outcome-report rate, and behavior-change rate, without prompts or raw identity.

The prediction-market workflow is documented at
[`docs/PREDICTION_MARKET_PREFLIGHT.md`](./docs/PREDICTION_MARKET_PREFLIGHT.md).
Its privacy-safe aggregate metrics are available at
`GET /v1/metrics/prediction-market-evaluations`.

## MCP Discovery tools

When the catalog is enabled, MCP also exposes:

- `evaluate_prediction_market`
- `report_prediction_market_outcome`
- `evaluate_tool_risk`
- `report_tool_outcome`
- `search_tools`
- `get_tool`
- `compare_tools`
- `get_trust_score`
- `recommend_tools`
- `list_capabilities`
- `get_capability_graph`
- `search_official_docs`
- `inspect_tool_server`
- `invoke_registered_tool`

alongside the existing executable tools.

`evaluate_prediction_market` is the primary first-use path: one call evaluates
an exact Polymarket market for settlement, liquidity, eligibility, and execution
risk without predicting or trading. `evaluate_tool_risk` is the second wedge,
used before an Agent installs or invokes an unfamiliar third-party tool.
`search_official_docs` remains a supporting path and returns bounded first-party
citations instead of raw provider indexes. Arbitrary URLs, authenticated
servers, non-active entries, unverified providers, and destructive tools are
rejected. Remote results are bounded and explicitly marked as untrusted data.

## MCP task prompts

Clients that expose MCP Prompts also receive four task-oriented starting
points:

- `preflight-prediction-market` — turns an exact market and contemplated action
  into an `evaluate_prediction_market` call;
- `evaluate-agent-tool` — finds a catalog candidate, calls the contextual risk
  preflight, and requires an `allow`, `review`, or `block` result;
- `research-official-docs` — turns a real technical question into a
  `search_official_docs` call;
- `verify-public-deployment` — turns a concrete public deployment claim into a
  `verify_web` call.

Rendering or opening a prompt never counts toward the 1,000-Agent target. Each
template explicitly requires a non-error tool result that materially answers
the user's task. The server records only aggregate `prompts/list` and
`prompts/get` activation stages, never prompt arguments or task text.

MCP prompt arguments are strings. `evaluate-agent-tool` requires an explicit
`permissions` argument, for example `"public_network,credentials"` or the JSON
array string `'["public_network","credentials"]'`. Use `"[]"` only when the
action requires no permissions. Missing, malformed, and unknown permissions
are rejected rather than silently treated as safe. This string encoding is
for `prompts/get` only; `evaluate_tool_risk` still accepts a JSON array.

For direct trading-Agent integration, see
[`docs/AGENT_INTEGRATION_QUICKSTART.md`](docs/AGENT_INTEGRATION_QUICKSTART.md).
The privacy-safe first-10 cohort process is documented in
[`docs/FIRST_10_AGENT_PILOT.md`](docs/FIRST_10_AGENT_PILOT.md).

## Capability Graph

Agents can explore shared-capability edges and get related-tool recommendations:

```bash
curl -sS http://127.0.0.1:4040/v1/capabilities | jq
curl -sS http://127.0.0.1:4040/v1/graph/capabilities | jq '.edges[:3]'
curl -sS http://127.0.0.1:4040/v1/tools/verify_web/related | jq
```

Similarity is Jaccard over capability sets, with small boosts for matching
protocol/category (`cap_v1`). This is the seed of the long-term Capability Graph.

## Quick start

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm run dev
```

Default: `http://127.0.0.1:4040`

With Postgres:

```bash
docker compose up -d postgres
export DATABASE_URL=postgres://404:404@127.0.0.1:5432/404
npm run db:migrate
npm run dev
```

On boot, first-party tools are seeded into the catalog (`SEED_FIRST_PARTY_TOOLS=true`)
so `GET /v1/tools/search?capability=web-verification` returns `verify_web`.
The six operator-reviewed public MCP servers are also seeded as pending entries
when `SEED_CURATED_MCP_SERVERS=true`. The verification worker performs live MCP
admission before they become discoverable or executable.

### Verification worker

- Default: `VERIFICATION_WORKER_MODE=inline` (loop inside HTTP process)
- Split out for production load:

```bash
export VERIFICATION_WORKER_MODE=external
npm run worker:verify
```

### Provider ownership (DNS TXT or GitHub bio)

```bash
# Domain provider
curl -sS -X POST http://127.0.0.1:4040/v1/providers/example-labs/ownership/challenge
# Publish DNS: _404-directory.example.com TXT "404-directory-verify=<token>"
curl -sS -X POST http://127.0.0.1:4040/v1/providers/example-labs/ownership/verify

# GitHub provider (identity.type=github)
curl -sS -X POST http://127.0.0.1:4040/v1/providers/octo/ownership/challenge
# Put "404-directory-verify=<token>" in the public GitHub profile bio
curl -sS -X POST http://127.0.0.1:4040/v1/providers/octo/ownership/verify
```

Ownership Score ladder: first-party `1.0` → dns_txt `0.95` → github_bio `0.9` →
generic verified `0.8` → unverified `0.35`.

```bash
npm test
npm run typecheck
npm run build
npm start
```

## Agent discovery (404 service tools)

The service inventory and the registered ecosystem catalog are distinct:

| Surface | Meaning |
| --- | --- |
| MCP `tools/list`, `GET /tools` | The same enabled, callable 404 service tools (16 with the default native tools, catalog and gateway enabled) |
| `GET /tools/:name` | The actual MCP argument schema, safety annotations, and explicit MCP / REST invocation routes |
| `GET /v1/tools/search` | Registered target records, including seeded first-party and third-party tools; a match is not permission to execute |
| `GET /v1/capabilities` | Capability labels for ecosystem records, not a list of callable 404 functions |

The homepage, installation guides, docs, server card, and discovery metadata
derive the enabled tool inventory from the real MCP registration at startup.
The three gateway tools (`search_official_docs`, `inspect_tool_server`,
`invoke_registered_tool`) are MCP-only: their metadata has `invocation.rest: null`.
For other tools, follow the declared REST path and parameter mapping instead
of assuming that `/tools/:name` executes a tool. HTTP contracts remain in
`/openapi.json`; MCP metadata schemas follow MCP's JSON Schema dialect, not
OpenAPI 3's schema dialect. Restart after changing registration/configuration.

See [discovery consistency audit](docs/AUDIT_SERVICE_DISCOVERY_2026-08-27.md)
for validation, compatibility notes, and the local-only delivery boundary.

```bash
curl -sS http://127.0.0.1:4040/tools | jq
curl -sS http://127.0.0.1:4040/tools/understand_webpage | jq
curl -sS http://127.0.0.1:4040/openapi.json | jq '.paths | keys'
curl -sS http://127.0.0.1:4040/mcp-info | jq
curl -sS http://127.0.0.1:4040/llms.txt
curl -sS http://127.0.0.1:4040/health
```

Homepage (`GET /`) is intentionally minimal: brand, tagline, tool names, and
links to Tools / MCP / OpenAPI / Docs / Health.

## REST examples

```bash
curl -sS http://127.0.0.1:4040/understand \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com"}'

curl -sS http://127.0.0.1:4040/verify/web \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","expected_status":200,"expected_text":"Example Domain"}'
```

`verify_web` returns compact booleans in `checks` plus a structured `evidence`
object containing requested/final URLs, HTTP status comparison, expected-text
matching, TLS validation, the complete redirect chain, timestamp, and explicit
Claim → Evidence paths.

Tool execution is currently public and free. Rate limits use Vercel's trusted
client-IP header (or the socket IP locally).

## MCP

### Streamable HTTP (same process as REST)

Point MCP clients at `https://404.directory/mcp` (or local `http://127.0.0.1:4040/mcp`).

The hosted endpoint can also be used directly as an OpenAI Responses API
remote MCP tool. A copy-ready payload with a privacy-safe installation token is
available in [`llms-install.md`](./llms-install.md#openai-responses-api); see the
[official OpenAI MCP guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp).

To count as a de-duplicated real external Agent, send a stable random,
non-personal identifier in `X-404-Agent-ID`. The server persists only an HMAC
digest, never the raw ID, prompts, arguments, or results. `X-404-Source` is an
optional lowercase attribution label. Public progress is available at
`GET /v1/metrics/agents`; complete client examples are at
`https://404.directory/connect`.

OpenAI Responses does not document arbitrary remote MCP request headers. Its
example instead uses the supported MCP `authorization` field with a generated
`agent:<uuid>@<source>` installation token. 404.directory accepts only that
strict non-personal shape as an Agent identity; unrelated OAuth bearer tokens
remain anonymous and are never treated as Agent IDs.

The privacy-safe activation funnel is available at
`GET /v1/metrics/activation`. It reports observed Connect views and installer
clicks plus de-duplicated external Agents that completed MCP `initialize`,
`tools/list`, `prompts/list`, `prompts/get`, attempted a tool call, failed a tool
call, or completed a successful tool execution. The per-source output separates
call rate, call success rate, prompt-to-success rate, and end-to-end activation
rate. Every stage except successful execution is diagnostic only and never
counts toward the 1,000-Agent target. Prompt names and arguments are not stored
in activation events. No raw Agent IDs, IPs, prompts, arguments, or results are
stored in the funnel.

`GET /v1/metrics/agents` also reports privacy-safe 7/30-day retention cohorts
and qualified Agent counts by safe client label. An Agent becomes eligible only
after a complete observation window and is retained only after another success
on a later UTC day. `GET /v1/metrics/reliability?days=30` aggregates external
execution evidence by tool, registered provider, client, and attribution source,
including sample size, success rate, P50/P95 latency, result count, and a finite
error taxonomy. Anonymous external executions can inform reliability but never
count toward the 1,000 identified-Agent target.

The official MCP Registry entry also declares `X-404-Agent-ID` as an install
input and defaults `X-404-Source` to `official-registry`, so compatible clients
can preserve a privacy-safe identity instead of silently creating anonymous
usage. The service remains usable without either header.

The dynamic install page also generates a one-click VS Code / GitHub Copilot
Agent link with a unique non-personal ID already embedded:

https://404.directory/connect?source=github

Registry clients can display the same-domain, script-free service icon at
`https://404.directory/icon.svg`.

For clients or directories that accept only a stdio launch command, use the
identity-preserving hosted bridge. It creates one random Agent ID per MCP client
in the user's normal application-data directory and reuses it across restarts:

```json
{
  "mcpServers": {
    "404-directory": {
      "command": "npx",
      "args": ["-y", "@mmvv1638/404-directory-mcp"]
    }
  }
}
```

No account or API key is required. The bridge is dependency-free and forwards
only MCP JSON-RPC traffic to `https://404.directory/mcp`.

Codex supports MCP HTTP headers in `~/.codex/config.toml`:

```toml
[mcp_servers.404_directory]
url = "https://404.directory/mcp"
http_headers = { "X-404-Agent-ID" = "agent:REPLACE_WITH_A_STABLE_RANDOM_ID", "X-404-Source" = "codex" }
```

Do not add only the bare MCP URL if you want the Agent installation to retain a
privacy-safe identity. Use the generated Codex configuration at
https://404.directory/connect?source=github.

### stdio

```json
{
  "mcpServers": {
    "404-directory": {
      "command": "npm",
      "args": ["run", "mcp", "--silent"],
      "cwd": "/absolute/path/to/this/repo"
    }
  }
}
```

Tools are registered automatically from the Tool Registry — adding a tool does
not require hand-writing separate MCP adapters.

## Adding a tool

1. Implement handler + Zod input/output schemas
2. Create a `ToolDefinition` in `src/tools/definitions/`
3. Register it in `src/tools/create-registry.ts`

REST, OpenAPI, `/tools/:name`, and MCP pick it up from the registry. Keep
`/tools` compact so discovery cost does not grow with every schema.

## Cloud Run / production

Production runs on Google Cloud Run. `Dockerfile` uses Node slim and
installs only Chromium's headless shell so the retained Artifact Registry image
stays below the 0.5 GiB free storage allowance.

**Catalog persistence is required in production.** Without `DATABASE_URL` and
with `CATALOG_MEMORY_FALLBACK=true` (the local default), Registry / Trust /
telemetry evaporate on every cold start. Also: request-based Cloud Run does
**not** reliably run in-process `setInterval` workers — use an external worker.

```bash
# 1) Managed Postgres (Cloud SQL / Neon / etc.) + migrate
export DATABASE_URL=postgres://...
npm run db:migrate

# 2) API service
gcloud run deploy directory-404 \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --execution-environment gen2 \
  --cpu 1 \
  --memory 2Gi \
  --concurrency 4 \
  --min-instances 0 \
  --max-instances 1 \
  --timeout 120 \
  --port 8080 \
  --set-env-vars "DATABASE_URL=${DATABASE_URL},CATALOG_MEMORY_FALLBACK=false,VERIFICATION_WORKER_MODE=external,REGISTRY_REQUIRE_AUTH=true,REGISTRY_ADMIN_TOKEN=${REGISTRY_ADMIN_TOKEN},PUBLIC_BASE_URL=https://404.directory,HOST=0.0.0.0,PORT=8080"

# 3) Independent verification worker (Cloud Run Job + Scheduler, or always-on)
#    VERIFICATION_WORKER_MODE=external on the API; run:
#    npm run worker:verify
```

Registry write APIs (`POST /v1/tools`, ownership challenge/verify, manual
verify) require `Authorization: Bearer <REGISTRY_ADMIN_TOKEN|provider_api_key>`.
New providers receive a one-time `provider_api_key`. Search defaults to
`status=active` only — pending tools stay quarantined.

Apply `cloudrun.cleanup-policy.json` to the source-deploy Artifact Registry
repository so superseded, untagged images do not accumulate storage charges.

Local Docker remains available:

```bash
cp .env.example .env
docker compose up --build -d
```

Production hardening notes:

- Keep `BROWSER_EGRESS_ALLOWED_PORTS` narrow (default `80,443`)
- Tune `RATE_LIMIT_*` and verify/browser timeouts for your traffic
- Tool execution has a stricter `TOOL_RATE_LIMIT_MAX` than discovery
- The remote MCP gateway is limited to operator-curated, provider-verified,
  active, no-auth servers and explicit read-only tool allowlists
- Gateway arguments are capped at 16 KiB; results and external-call duration are
  bounded by `MCP_GATEWAY_MAX_RESULT_BYTES` and `MCP_GATEWAY_TIMEOUT_MS`
- Set `CATALOG_MEMORY_FALLBACK=false` whenever `DATABASE_URL` is configured
- Prefer `VERIFICATION_WORKER_MODE=external` on serverless

## Security boundaries

- HTTP(S) only; URL credentials rejected
- DNS → private/loopback/link-local/reserved addresses rejected
- `verify_web` pins each connection to the exact public IP that passed DNS
  validation, then re-resolves and re-validates every redirect hop. TLS SNI is
  sent only for hostnames; IP-literal URLs (e.g. `https://1.1.1.1`) omit SNI and
  validate the certificate against the IP instead
- `verify_web` caps response bodies; `198.18.0.0/15` and other reserved ranges
  are rejected in every environment
- `understand_webpage` re-resolves and re-validates every browser request, but
  Chromium request and routes it through a loopback-only forward proxy. That
  proxy resolves the destination, rejects private/reserved addresses and
  disallowed ports, then connects to the exact IP that passed validation.
  Chromium's implicit loopback bypass and QUIC are disabled, while non-proxied
  WebRTC UDP is blocked. Browser contexts also set `serviceWorkers: "block"`.
  A provider/network egress firewall is still recommended as an independent
  second layer when the hosting platform supports one
- Unexpected 500/MCP execution errors are sanitized; full details stay in logs
- Structured Tool logs include route, status, duration and Tool name, never
  request bodies
- Responses include request IDs, `Server-Timing`, no-sniff/frame/referrer/
  permissions/CSP headers; REST Tool results use `Cache-Control: no-store`,
  while MCP streaming uses the SDK's `no-cache, no-transform` policy

## Layout

```text
src/
  domain/          # catalog: registry, verification, trust, discovery, telemetry,
                   #          ownership, capability-graph, seed
  db/              # drizzle schema + migrate
  workers/         # standalone verification worker
  tools/           # first-party executable registry
  understand.ts    # understand_webpage service
  verify/          # verify_web implementation
  http/            # Fastify app, homepage, OpenAPI
  mcp/             # stdio + registry→MCP + discovery tools
  browser/         # Playwright collection
  security/        # SSRF / URL guards
drizzle/           # SQL migrations
```
