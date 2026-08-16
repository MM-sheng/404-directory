# 404.directory

Tools built for AI agents.

A multi-tool platform with a unified Tool Registry. Agents discover capabilities
via `/tools`, call them over REST or MCP, and get structured Zod-validated
results.

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

## MCP

### Streamable HTTP (same process as REST)

Point MCP clients at `https://404.directory/mcp` (or local `http://127.0.0.1:4040/mcp`).

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

REST, OpenAPI, `/tools`, and MCP pick it up from the registry.

## Docker / production

```bash
cp .env.example .env
docker compose up --build -d
# or
./scripts/deploy.sh
```

Image is based on Playwright’s official jammy image (Chromium included). Set
`PUBLIC_BASE_URL=https://404.directory`.

### Domain cutover (`404.directory`)

The apex domain is registered at Spaceship and currently serves their **parking
page** (HTTP openresty/S3). HTTPS to the parking IPs times out. Production
cutover requires DNS changes you control:

1. Build/run this image on Fly, a VPS, or Cloud Run (`fly.toml` included)
2. In Spaceship DNS, replace parking A records with your host (or CNAME to Fly)
3. Issue TLS for `404.directory` (Fly certs / Caddy / Cloudflare)
4. Smoke-test `/`, `/health`, `/tools`, `/openapi.json`, `/understand`,
   `/verify/web`, `/mcp`

Temporary public smoke test from a laptop:

```bash
npm run build && npm start
cloudflared tunnel --url http://127.0.0.1:4040
```

Production hardening notes:

- Keep egress restricted; SSRF checks are defense-in-depth, not a substitute for
  network policy
- Tune `RATE_LIMIT_*` and verify/browser timeouts for your traffic
- Run as non-root (`pwuser` in the image)

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
  Chromium performs its own DNS lookup when it opens the socket, so the
  application layer cannot fully close the DNS-rebinding window on its own.
  Browser contexts also set `serviceWorkers: "block"` so Service Workers cannot
  bypass `browserContext.route()` interception (Playwright recommendation).
  **Production must enforce network-level private-egress blocking** (e.g. an
  egress firewall/proxy denying RFC1918, loopback, link-local, and reserved
  ranges) as the authoritative backstop for this tool
- Structured errors, request logging, health checks, rate limits

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
