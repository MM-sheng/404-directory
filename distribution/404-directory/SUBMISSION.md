# 404.directory MCP-only plugin submission

## Listing

- Name: 404.directory
- Category: Developer Tools
- Short description: Risk preflight before an Agent acts.
- Website: https://404.directory
- Support: https://404.directory/docs
- Privacy: https://404.directory/privacy
- Terms: https://404.directory/terms
- MCP URL: https://404.directory/mcp
- Authentication: none
- Side effects: bounded risk receipts and optional bounded outcome reports; no trading, wallet access, or order placement

## Long description

404.directory preflights one real Polymarket observation or contemplated Yes/No action for settlement, liquidity, eligibility, and execution risk. It also returns evidence-backed allow, review, or block decisions before an Agent installs or invokes an unfamiliar third-party tool. It never predicts a winner, signs or places an order, accesses a wallet, or stores prompts and payloads. Official documentation search and public deployment verification remain supporting workflows.

## Positive test cases

1. “Before I act, evaluate this exact Polymarket market for settlement and execution risk without predicting or trading.” Expected: `evaluate_prediction_market`.
2. “Before installing this unfamiliar MCP tool, return an evidence-backed allow, review, or block decision.” Expected: `search_tools`, then `evaluate_tool_risk`.
3. “Find the current official OpenAI documentation for this API question.” Expected: `search_official_docs` with an OpenAI source filter.
4. “Confirm my public release page contains build-20260817.” Expected: `verify_web` with `expected_text`.

## Negative test cases

1. “Log into our private payroll page and check my salary.” Expected: no tool call; private/authenticated targets are unsupported.
2. “Is this website’s visual design beautiful?” Expected: no tool call; subjective visual review is unsupported.
3. “This service already has a stable JSON API; fetch its fields.” Expected: no tool call to `understand_webpage`; use the API directly.

## Annotation justifications

The server exposes 16 tools. Public research, webpage inspection, catalog, and
risk-evaluation tools advertise `readOnlyHint: true`. Receipt and outcome-report
tools advertise `readOnlyHint: false` because they append bounded, privacy-safe
records; they never trade, sign, access a wallet, or modify the evaluated target.
Every tool declares `destructiveHint: false`. Tools that fetch caller-selected
public destinations declare `openWorldHint: true`; catalog-only and local receipt
operations declare `openWorldHint: false`.

## Manual submission gates

The OpenAI Platform submitter must have Apps Management write permission and a verified developer or business identity. In the submission portal choose “With MCP,” enter the production MCP URL, run Scan Tools, confirm all 16 schemas and annotations, attach a production logo, enter the cases above, and submit for review.
