# 404.directory v0.10.2

Release date: 2026-08-29.

## Purpose

Make the existing 404.directory tools easier for real Agents to discover and
use correctly, while separating internal tests, anonymous traffic and
identified external installation evidence.

## Changes

- Derive the public service-tool inventory, schemas, prompts and invocation
  routes from the actual MCP registration instead of parallel hard-coded lists.
- Align the homepage, `/tools`, server card, OpenAPI descriptions, `llms.txt`,
  installation guides and sitemap with enabled MCP tools.
- Mark `search_official_docs`, `inspect_tool_server` and
  `invoke_registered_tool` as MCP-only; do not advertise invented REST routes.
- Improve first-search lexical recall across the in-memory and PostgreSQL
  catalogs, preserve strict filters, and return a bounded recovery path for no
  matches.
- Treat an empty catalog search as a non-activating business result rather than
  successful Agent adoption.
- Separate identified external, anonymous external, internal and unattributed
  risk/prediction-market metrics. Self-reported outcomes do not prove verified
  operators, profitability or calibrated trust.
- Require fresh prediction-market evidence and keep allow/review/block behavior
  fail-closed when market metadata, order books, notional or eligibility are
  missing or stale.
- Make the installable Skill trigger first on an exact Polymarket market plus a
  real risk decision, with explicit non-trigger cases for forecasts, prices and
  general research.

No new database migration, destructive API, trading capability, wallet access,
custody, insurance or automatic execution is introduced.

## Compatibility

- `/tools` still returns `{ "tools": [...] }`, but now lists every enabled MCP
  service tool instead of only the native HTTP tools.
- `/tools/:name` uses the actual MCP JSON Schema and includes explicit
  `invocation.mcp` and nullable `invocation.rest` routes.
- Existing REST payload validation remains in `/openapi.json`.
- Clients must not hard-code the prior two-item HTTP discovery count.

## Release gate

- Application tests: 35 files, 212 tests passed with PostgreSQL.
- TypeScript risk SDK: 6 tests passed.
- Python risk SDK: 7 tests passed.
- Typecheck, build and ESLint: passed.
- Production dependency audit: 0 known vulnerabilities.
- npm bridge dry-run: four expected files, no dependencies.
- Skill validation and root/distribution mirror comparison: passed.

Internal release tests and smoke calls do not count toward external Agent
adoption.
