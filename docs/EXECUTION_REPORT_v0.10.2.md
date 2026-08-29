# v0.10.2 production execution report

Executed: 2026-08-29 UTC

## Result

404.directory v0.10.2 was merged, released and deployed successfully. Cloud
Run revision `directory-404-v0102-7ce485a` serves 100% of production traffic at
`https://404.directory`. The previous v0.10.1 revision remains available at 0%
for rollback.

## Source and distribution

- Merge commit: `7ce485a3c0b5cbc89c8ecba57b2deaf6cc20e140`
- Pull request: #26
- Git tag and GitHub Release: `v0.10.2`
- npm: `@mmvv1638/404-directory-mcp@0.10.2`, dist-tag `latest`
- Official MCP Registry: `io.github.MM-sheng/404-directory` v0.10.2
- Publish workflow: GitHub Actions run `33243805678`, both npm and Registry
  jobs passed

## Verified release gates

- Application: 35 test files, 212 tests passed
- TypeScript risk SDK: 6 tests passed
- Python risk SDK: 7 tests passed
- Type checking, production build and lint passed
- Production dependency audit: 0 vulnerabilities
- MCP proxy package and installable Skill validation passed
- No database migration was required
- GitHub pull-request CI passed before merge

## Production verification

- Cloud Run canary started healthy with the existing database, secrets,
  egress, rate-limit and registry settings
- `/health` returned v0.10.2 and all 16 tool names
- MCP initialize and `tools/list` returned server v0.10.2 and 16 tools
- `verify_web`, `search_official_docs` and `search_tools` completed through MCP
- all 16 `/tools/:name` metadata routes returned HTTP 200
- the first-shot activation suite passed against the canary
- `evaluate_prediction_market` completed against a public Polymarket market in
  observe mode and returned a conservative `review` decision under
  `polymarket-preflight-v2`; it placed no order
- after cutover, the canonical-domain MCP handshake and the three read-only
  calls passed again
- no ERROR-level logs were found for the new revision during rollout

One immediate repeat of the full first-shot suite on the canonical domain was
rate-limited with HTTP 429 after the preceding release tests. This confirms the
public rate limit was active; it was not treated as an application failure
because the identical suite had already passed on the canary and the canonical
MCP handshake plus real calls had passed after cutover. After the rate-limit
window elapsed, the complete canonical-domain first-shot suite was rerun and
passed with v0.10.2 and all 16 tools.

## Measurement boundary

At 2026-08-29 08:44 UTC, `/v1/metrics/agents` reported:

- 2 identified external-classified Agent IDs;
- 15 successful identified invocations;
- 22 anonymous successful invocations;
- 0 repeat Agents on a later UTC day.

These counters are evidence about attributed execution, not proof of two
independent retained users. Release smokes were labelled internal and do not
qualify as external Agent growth.

## Skipped or still external

- Cursor Marketplace review remains controlled by Cursor.
- Claude directory publication still requires an eligible organization portal.
- MCP.Directory and other third-party directory reviews remain controlled by
  their maintainers.
- npm and PyPI risk SDK package initialization remains a separate owner/account
  setup task; the production MCP release does not depend on it.

These items do not affect production availability, npm MCP installation or
Official MCP Registry discovery. They affect only additional distribution and
future acquisition measurement.
