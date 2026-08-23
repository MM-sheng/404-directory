# MCP client acceptance matrix

This document separates protocol/package evidence that can be automated from a
real external installation. Internal validation proves release compatibility;
it never counts toward the 1,000-Agent adoption target.

## Release gate

Every supported path must complete:

1. Install from a clean environment.
2. Send MCP `initialize`.
3. Send `notifications/initialized`.
4. List exactly the 12 documented tools.
5. Execute `verify_web` and `search_tools`.
6. Execute one real read-only provider call through `search_official_docs`.
7. Preserve a stable random Agent ID without exposing it in analytics storage.
8. Preserve the source label and negotiated MCP protocol version.

## Matrix

| Client/path | Installation surface | Automated evidence | Real client evidence required before claiming support | Attribution source |
| --- | --- | --- | --- | --- |
| Universal stdio | `npx -y @mmvv1638/404-directory-mcp` | Package, identity persistence, concurrency, protocol negotiation and forwarding tests | Clean install against public npm v0.9.2 after release | `npx` or supplied `--source` |
| Official MCP Registry | npm package plus remote HTTP in `server.json` | Registry validation and package ownership metadata | Install from a Registry-compatible client after v0.9.2 propagation | `official-registry` |
| Cursor | One-click URL or stdio bridge | Generated URL/config schema, stable generated ID, source test | Open a clean Cursor profile, install, list 12 tools, make one useful call | `<campaign>.cursor` |
| VS Code / GitHub Copilot | `vscode:mcp/install` URL | Generated URL/config schema and source test | Open a clean VS Code profile, install, list 12 tools, make one useful call | `<campaign>.vscode` |
| Claude Code | native plugin or direct HTTP command | Plugin manifest/package validation and bridge tests | Install from a clean user scope and make one useful call | `claude` / campaign source |
| Codex | generated HTTP/TOML configuration | Configuration is rendered and covered by HTTP tests | Add to a clean Codex profile and make one useful call | `<campaign>.codex` |
| OpenAI Responses API | remote MCP tool configuration | Submission/review payload validation | One external application performs a useful call with its stable deployment ID | `openai-responses` |
| Generic Streamable HTTP | `https://404.directory/mcp` with headers | Release smoke covers initialize/list/call and protocol headers | One independent MCP SDK/client repeats the flow | supplied safe label or `direct` |

## Evidence record template

Record one row per real validation. Never paste prompts, arguments, results,
credentials, raw Agent IDs, raw session IDs, or personal information.

| Date UTC | Client/version | Install path | Source | 12 tools | Useful call | Stable identity | External/internal | Evidence link | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-08-23 | Universal stdio bridge / v0.9.2 | Fresh temporary npm project from the locally packed release tarball | `official-registry` | Yes, exactly 12 | `search_tools` returned `verify_web` | Yes; the second process reused the client-scoped identity file | Internal | Execution report and CI logs | Automated pass; public npm v0.9.2 still pending |
| 2026-08-23 | Generic Streamable HTTP / MCP SDK 1.30.0 | Production `https://404.directory/mcp` | `release-smoke` | Yes, exactly 12 | `verify_web`, Microsoft `search_official_docs`, gateway discovery/inspection/invocation | Stable internal test identity; explicitly excluded from adoption | Internal | Execution report | Pass against production v0.9.1; repeat after v0.9.2 deploy |

## First useful task

Use one task that has a real outcome rather than a synthetic list request:

```text
Use search_official_docs to find the current official guidance for MCP
Streamable HTTP. Cite the first-party sources and distinguish facts from
inference.
```

The installation passes only if a tool returns a non-error result. Health
checks, `initialize`, `tools/list`, marketplace scanners, and internal smoke
tests are diagnostic evidence only.

## Failure record

Use the finite failure stage and error taxonomy:

```text
install_failed
initialize_failed
protocol_mismatch
tools_list_failed
invalid_arguments
tool_not_found
tool_not_allowed
authentication_not_supported
provider_not_verified
provider_timeout
provider_rate_limited
provider_unavailable
empty_result
unsafe_url
client_disconnected
tool_execution_failed
```

If a client fails, record the client version, stage, canonical error type and
request ID. Do not record request content.
