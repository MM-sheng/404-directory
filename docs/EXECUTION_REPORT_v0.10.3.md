# v0.10.3 production execution report

Executed: 2026-08-30 UTC

## Result

404.directory v0.10.3 was merged, migrated, released and deployed
successfully. Cloud Run revision `directory-404-v0103-f974214` serves 100% of
production traffic at `https://404.directory`. The previous v0.10.2 revision
remains available at 0% for rollback.

This release establishes a strict evidence boundary for the 1,000-Agent goal.
At release time, the authoritative result is **0 verified external Agents out
of 1,000**. The separate unverified diagnostic reports 2 installation ID
digests and 15 successful external-classified invocations; these values do not
prove independent operators and do not count toward the target.

## Source and distribution

- Merge commit: `f974214302bc5248bad7939e6dd004698cae887a`
- Pull request: [#28](https://github.com/MM-sheng/404-directory/pull/28)
- Git tag and GitHub Release: [v0.10.3](https://github.com/MM-sheng/404-directory/releases/tag/v0.10.3)
- npm: `@mmvv1638/404-directory-mcp@0.10.3`, dist-tag `latest`
- Official MCP Registry: `io.github.MM-sheng/404-directory` v0.10.3, active
  and latest
- Publish workflow: [GitHub Actions run 33292749936](https://github.com/MM-sheng/404-directory/actions/runs/33292749936),
  both npm and Registry jobs passed

## Verified release gates

- Application: 36 test files, 216 tests passed under Node.js 22 and PostgreSQL
  16
- Type checking, service build and ESLint passed
- Production dependency audit: 0 vulnerabilities
- Python risk SDK: 7 tests passed
- npm MCP proxy dry-run package validation passed at v0.10.3
- GitHub pull-request CI passed before merge

## Database migration

The additive migration `0009_verified_agent_evidence.sql` completed in
production. The migration ledger contains 10 rows, and
`verified_agent_admissions` exists with the expected application privileges.
The application role has `SELECT`, `INSERT` and `UPDATE` on the new table but
does not have `CREATE` on the `public` schema.

The first local migration helper attempt was stopped after Node.js 26 left the
TypeScript migration process waiting. It did not create the new table. The
temporary schema `CREATE` grant was immediately revoked and verified. The same
migration was then run successfully with the database owner through an
isolated Node.js 22 environment. No destructive migration or data rewrite was
performed.

## Production verification

- the canary revision started healthy with v0.10.3 and all 16 MCP tools;
- `/health`, the homepage, `llms.txt`, `/metrics`, the verified metric and the
  unverified diagnostic were checked on the canary and canonical domain;
- MCP initialize and `tools/list` returned v0.10.3 and all 16 tools;
- `verify_web`, `search_official_docs` and `search_tools` completed through the
  canonical MCP endpoint with internal release-test attribution;
- first-shot activation, identity, catalog parity, official-document context
  budget and homepage classification checks passed;
- unauthorized admission creation returned HTTP 401;
- no ERROR-level Cloud Run logs were found for the new revision during or after
  rollout;
- the internal release tests did not increase the verified or unverified
  external counters.

## Measurement boundary

At 2026-08-30 04:33 UTC, `/v1/metrics/verified-agents` reported:

- 0 active evidence admissions;
- 0 verified external Agents;
- 0 verified independent operators;
- 0 qualifying successful external invocations;
- 0 later-day repeat Agents.

At the same time, `/v1/metrics/agents` reported the explicitly unverified
diagnostic:

- 2 installation ID digests;
- 15 successful external-classified invocations;
- 33 anonymous successful invocations;
- 0 later-day repeat Agents.

The legacy diagnostic now exposes `counts_toward_target: false` and does not
contain target or progress fields. An Agent counts only after a separate
operator/evidence admission matches a successful explicit external tool call.
Anonymous traffic, failures, probes, crawlers, internal tests, revoked
admissions and duplicate installations are excluded.

## Still external or incomplete

- [demwick/polymarket-agent-mcp #97](https://github.com/demwick/polymarket-agent-mcp/pull/97)
  remains open and awaiting maintainer review. Its tests passed, but it has not
  produced verified usage.
- Cursor Marketplace, MCP.Directory and other third-party directory reviews
  remain controlled by their maintainers.
- Claude directory publication still requires an eligible organization portal.
- npm and PyPI risk SDK package initialization remains separate account setup.
- the production migration helper still grants and revokes a schema privilege
  that is unnecessary when the owner connection performs migrations; removing
  that behavior and adding guaranteed cleanup is follow-up operational work.

These items do not affect v0.10.3 production availability. They do affect
distribution, repeat-use acquisition and the path from 0 to the first verified
external Agents. No listing, pull request, download, handshake or internal
smoke test is being claimed as a real Agent user.
