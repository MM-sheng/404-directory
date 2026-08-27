# Execution report — v0.10.0

Date: 2026-08-27

## Goal

Safely publish prediction-market risk preflight from merged `main` (`a873fb1`)
as production `v0.10.0` without claiming prediction, trading, custody, or
insurance capabilities.

## Result

**Complete.** Production cutover to v0.10.0 succeeded after owner-role Neon
migration and canary verification.

## Local verification

- `npm test`: 122 passed / 5 skipped
- `npm run typecheck`: pass
- `npm run lint`: 0 errors (2 unused-disable warnings in generated worker types)
- `npm run build`: pass
- `npm run mcp:proxy:pack`: `@mmvv1638/404-directory-mcp@0.10.0`
- `npm audit --omit=dev`: 0 vulnerabilities
- Temp Postgres migrate + remigrate: `prediction_market_evaluations` created; idempotent

## Production baseline before cutover

- Health version: `0.9.3`
- MCP tools: 12
- Cloud Run revision: `directory-404-aidisc-cbda6a7`
- Identified external agents: 1
- Successful external invocations: 6

## Database backup and migration

- Backup: `/Users/m/404-directory-backups/neondb-pre-v0.10.0-20260826T041826Z.dump` (PGDMP, 666KB)
- Restore notes: `/Users/m/404-directory-backups/RESTORE-pre-v0.10.0-20260826T041826Z.md`
- Neon project: `404-directory-catalog` (`dry-tooth-17596838`)
- Blocker resolved: migrations `0007`/`0008` applied as `neondb_owner` via `scripts/release-prod-migrate.sh`
- Post-migrate tables: `risk_evaluations`, `prediction_market_evaluations` (9 migration rows)

## Cloud Run cutover

| Step | Revision / URL | Result |
| --- | --- | --- |
| Pre-cutover traffic | `directory-404-aidisc-cbda6a7` (v0.9.3) | 100% public traffic |
| Failed canary (pre-migrate) | `directory-404-v010-b36da6d` | Startup failed on DDL |
| Healthy canary | `directory-404-v010-postmigrate` | `/health` v0.10.0, 16 tools |
| Production traffic | `directory-404-v010-postmigrate` | 100% after cutover |
| Rollback target | `directory-404-aidisc-cbda6a7` (tag `aidisc-canary`) | Kept at 0% |

Public health after cutover: `https://404.directory/health` → version `0.10.0`, 16 MCP tools.

## Canary verification (internal headers)

All canary calls used `X-404-Agent-Class: internal` and stable internal IDs.

| Check | Result |
| --- | --- |
| MCP regression (`verify_web`, `search_official_docs`, `search_tools`) | Pass |
| `evaluate_prediction_market` (Polymarket `xi-jinping-out-before-2027`, observe/supervised) | Pass — decision `review`, receipt issued |
| `report_prediction_market_outcome` | Pass — `recorded`, duplicate → `already_reported` |
| `evaluate_tool_risk` / `report_tool_outcome` (`verify_web` slug) | Pass — decision `allow`, outcome recorded |
| REST `GET /v1/prediction-markets/evaluations/{id}` | Pass — decision + market slug returned |
| REST `GET /v1/metrics/prediction-market-evaluations` | Pass |
| External agent metrics unchanged | Pass — `identified_external_agents: 1`, `successful_external_invocations: 6` |

## MCP tool inventory (v0.10.0)

16 tools (not 14 as originally estimated):

1. understand_webpage
2. verify_web
3. evaluate_prediction_market
4. report_prediction_market_outcome
5. evaluate_tool_risk
6. report_tool_outcome
7. search_tools
8. get_tool
9. compare_tools
10. get_trust_score
11. recommend_tools
12. list_capabilities
13. get_capability_graph
14. search_official_docs
15. inspect_tool_server
16. invoke_registered_tool

## Release artifacts

- GitHub: tag `v0.10.0` on `b36da6d` (PR #22 merge)
- npm: `@mmvv1638/404-directory-mcp@0.10.0` (via publish workflow)
- Official MCP Registry: `io.github.MM-sheng/404-directory@0.10.0` (via publish workflow)

## Operational notes

- Production auto-migrate on boot uses app role `directory_404_app` (no DDL). Future schema changes should run `scripts/release-prod-migrate.sh` (owner role) before deploy, or grant temporary CREATE and revoke after migrate.
- `CREATE ON SCHEMA public` was revoked from `directory_404_app` after migration.
