# 404.directory

Tools built for AI agents.

A multi-tool platform with a unified Tool Registry. Agents discover capabilities
via `/tools`, call them over REST or MCP, and get structured Zod-validated
results.

Public discovery and copy-paste client setup:
https://github.com/MM-sheng/404-directory

## Current tools

| Tool                 | Endpoint           | When to use                                                                        |
| -------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `understand_webpage` | `POST /understand` | Understand an ordinary webpage (entities, state, actions) with no Agent-native API |
| `verify_web`         | `POST /verify/web` | Independently verify a public site after a deploy/update claim                     |

## Quick start

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm run dev
```

Default: `http://127.0.0.1:4040`

```bash
npm test
npm run typecheck
npm run build
npm start
```

## Agent discovery

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
stays below the 0.5 GiB free storage allowance. Deploy with request-based
billing, no warm instances, one maximum instance, and bounded concurrency:

```bash
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
  --port 8080
```

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
  tools/           # registry + tool definitions
  understand.ts    # understand_webpage service
  verify/          # verify_web implementation
  http/            # Fastify app, homepage, OpenAPI
  mcp/             # stdio + registry→MCP adapter
  browser/         # Playwright collection
  security/        # SSRF / URL guards
```
