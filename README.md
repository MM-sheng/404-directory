# 404.directory

**Agent Discovery + Trust Infrastructure.**

404.directory helps AI agents discover, verify, compare, and trust tools before
calling them — plus a small set of first-party executable tools
(`verify_web`, `understand_webpage`).

Public discovery and copy-paste client setup:
https://github.com/MM-sheng/404-directory

## Two layers

| Layer                            | Purpose                                              | Surface                                                                        |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Executable tools** (unchanged) | Run first-party tools in this process                | `GET /tools`, `POST /understand`, `POST /verify/web`, MCP tools                |
| **Ecosystem catalog** (Phase 1)  | Register / verify / trust / search third-party tools | `/v1/*`, MCP `search_tools` / `get_tool` / `compare_tools` / `get_trust_score` |

The long-term moat is invocation telemetry + trust/verification data — not a
marketing directory of tools.

## Current first-party tools

| Tool                 | Endpoint           | When to use                                                                        |
| -------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `understand_webpage` | `POST /understand` | Understand an ordinary webpage (entities, state, actions) with no Agent-native API |
| `verify_web`         | `POST /verify/web` | Independently verify a public site after a deploy/update claim                     |

## Agent Discovery API (`/v1`)

Requires a catalog backend (`DATABASE_URL` Postgres, or in-memory fallback when
`CATALOG_MEMORY_FALLBACK=true`).

```bash
# Register a tool
curl -sS http://127.0.0.1:4040/v1/tools \
  -H 'content-type: application/json' \
  -d '{
    "name":"btc_analyzer",
    "description":"Analyze BTC market signals for agents",
    "capabilities":["btc","market-analysis"],
    "protocol":"mcp",
    "endpoint":"https://example.com/mcp",
    "category":"finance",
    "provider":{"name":"Example Labs","identity":{"type":"domain","value":"example.com"}}
  }'

# Search
curl -sS 'http://127.0.0.1:4040/v1/tools/search?capability=btc&trust_threshold=0.2'

# Trust profile
curl -sS http://127.0.0.1:4040/v1/tools/btc_analyzer/trust
```

Trust Profile dimensions (v1 algorithm, extensible factors JSON):

- Ownership / Availability / Compatibility / Security / Usage → `overall_score`

## MCP Discovery tools

When the catalog is enabled, MCP also exposes:

- `search_tools`
- `get_tool`
- `compare_tools`
- `get_trust_score`
- `recommend_tools`
- `list_capabilities`
- `get_capability_graph`

alongside the existing executable tools.

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

## Agent discovery (first-party)

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

```bash
codex mcp add 404-directory --url https://404.directory/mcp
claude mcp add --transport http --scope user 404-directory https://404.directory/mcp
```

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

## Docker / production

```bash
vercel deploy --prod
```

Production runs as a Vercel Custom Container using `Dockerfile.vercel` and
`vercel.json`. The image is based on Playwright’s official Jammy image and runs
as the non-root `pwuser`. The Spaceship apex DNS is already pointed at Vercel;
Vercel terminates TLS for `https://404.directory`.

The free-tier migration target is Cloud Run. `Dockerfile` uses Node slim and
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
