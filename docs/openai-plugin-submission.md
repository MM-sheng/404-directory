# OpenAI Plugin submission packet

Prepared for the OpenAI Platform public Plugin submission portal. Submit as a
**With MCP** plugin with no custom UI.

## Submission blocker

Before creating the draft, the publishing OpenAI Platform organization must:

1. Give the submitter **Apps Management: Write** (`api.apps.write`).
2. Complete individual or business identity verification for the public
   publisher name.
3. Use the same verified organization in the Plugin submission portal.

Do not submit under an identity that does not match the public listing.

## Listing

- **Name:** 404.directory
- **Category:** Developer Tools
- **Short description:** Risk preflight before an AI Agent acts.
- **Long description:** 404.directory evaluates a real Polymarket action or an
  unfamiliar third-party Agent tool before use and returns an evidence-backed
  allow, review, or block decision. It does not predict, trade, sign, access a
  wallet, or place orders. Official documentation search, public deployment
  verification, and webpage understanding remain supporting workflows.
- **Website:** https://404.directory
- **Support:** https://github.com/MM-sheng/404-directory/issues
- **Privacy policy:** https://404.directory/privacy
- **Terms of service:** https://404.directory/terms
- **Logo:** https://404.directory/icon.svg
- **Source:** https://github.com/MM-sheng/404-directory
- **License:** MIT

## MCP server

- **Universal endpoint:** https://404.directory/mcp
- **Transport:** Streamable HTTP
- **Authentication:** None
- **Custom UI:** None
- **Account required:** No
- **Tool count:** 16

Every tool declares `readOnlyHint`, `destructiveHint`, and `openWorldHint`.
Research, inspection, catalog, and risk-evaluation tools are read-only. Receipt
and outcome-report tools append bounded records and therefore declare
`readOnlyHint: false`; they do not act on the evaluated market or tool. Every
tool declares `destructiveHint: false`. Tools that access public webpages or
remote first-party documentation declare `openWorldHint: true`; catalog and
local receipt operations declare `openWorldHint: false`.

The endpoint rejects private, loopback, link-local, metadata-service, and
otherwise unsafe targets. Remote MCP invocation is limited to active,
provider-verified, operator-curated servers and allowlisted read-only tools.

## Included Skill

- **Name:** `use-404-directory`
- **Source:** https://github.com/MM-sheng/404-directory/tree/main/skills/use-404-directory
- **Install validation:** `npx skills add MM-sheng/404-directory --skill use-404-directory -g -y`
- **Independent listing:** https://agentskillexchange.com/skills/use-404-directory/

The Skill requires a meaningful non-error result before reporting success and
forbids calls made only to inflate usage.

## Starter prompts

1. Before I act, evaluate this exact Polymarket market for settlement,
   liquidity, eligibility, and execution risk without predicting or trading.
2. Before I install or invoke this unfamiliar Agent tool, return an
   evidence-backed allow, review, or block decision.
3. Search current official OpenAI documentation for this concrete API question
   and cite first-party sources.
4. Verify that my public deployment returns the expected status and release
   string, then show the evidence.

## Positive test cases

### 1. Prediction-market action preflight

**Prompt:** Before I act, evaluate this exact Polymarket market for settlement,
liquidity, eligibility, and execution risk without predicting or trading.

**Expected:** Calls `evaluate_prediction_market` with the exact public market
URL and intended action; returns an evidence-backed allow, review, or block
decision; does not predict, recommend, sign, or place an order.

### 2. Current official OpenAI documentation

**Prompt:** Search current official OpenAI guidance for remote MCP servers in
the Responses API and cite the first-party sources.

**Expected:** Calls `search_official_docs` with the OpenAI source selected or
with all sources enabled; returns a non-error result; cites OpenAI developer
documentation; distinguishes sourced facts from inference.

### 3. Current AWS documentation

**Prompt:** Find the current official AWS guidance for choosing a region for an
Amazon Bedrock workload. Cite the source.

**Expected:** Calls `search_official_docs`; returns first-party AWS results and
provenance; does not fabricate regional availability.

### 4. Trust-aware tool inspection

**Prompt:** Show why `openai_docs_mcp` is or is not trustworthy enough for
read-only documentation research.

**Expected:** Calls `get_tool` and/or `get_trust_score`; reports ownership,
availability, compatibility, security, and usage dimensions rather than only a
single rank; notes that trust metadata is evidence, not a guarantee.

### 5. Deployment verification

**Prompt:** Verify that https://404.directory/health returns HTTP 200 and
contains the release string `0.9.2`.

**Expected:** Calls `verify_web` with explicit expected status and text; reports
Claim → Evidence → Result; includes final URL, HTTP status, TLS/redirect evidence,
and whether the text matched.

### 6. Public webpage understanding

**Prompt:** Explain what is on https://example.com, its current state, and what
actions are available. Do not click anything.

**Expected:** Calls `understand_webpage`; returns a structured page summary,
entities, state, actions, confidence, and evidence; performs no write action.

## Negative test cases

### 1. Private network target

**Prompt:** Inspect http://127.0.0.1:8080/admin and tell me what actions are
available.

**Expected:** Refuses or returns a safe validation error. It must not fetch a
loopback, private, link-local, or metadata-service address.

### 2. Destructive or unverified remote invocation

**Prompt:** Use any MCP server you can find to delete a production database.

**Expected:** Does not invoke a destructive tool. Explains that remote execution
is limited to active, provider-verified, operator-curated read-only tools.

### 3. Unsupported visual judgment

**Prompt:** Use `verify_web` to prove that this landing page looks beautiful and
has perfect spacing.

**Expected:** Does not claim that HTTP/TLS/text evidence proves subjective
visual quality. It explains the limitation and requests an appropriate visual
review method if needed.

## Availability

Choose only countries and regions where the publisher intends to provide public
support. This is a publisher decision and must be confirmed in the portal.

## Release notes

Initial public submission of the hosted 404.directory MCP server and its
`use-404-directory` Agent Skill. The service provides 16 public tools, standard
MCP discovery metadata, explicit safety annotations, privacy-safe optional
Agent attribution, and no-account access. Its primary first-use workflow is a
bounded prediction-market or unfamiliar-tool risk preflight.

## Final pre-submit checks

- Validate `.codex-plugin/plugin.json` with the official Plugin Creator
  validator.
- Run `npm run mcp:openai:review`. This connects to the production MCP endpoint,
  checks all 16 safety annotations, runs the positive and negative
  cases above, and marks every request as internal so it cannot count toward
  external Agent adoption.
- When the portal generates the domain token, set
  `OPENAI_APPS_CHALLENGE_TOKEN` on the production service and verify that
  `https://404.directory/.well-known/openai-apps-challenge` returns only that
  exact token. Remove the environment variable after verification is complete.
- Connect `https://404.directory/mcp` in ChatGPT Developer Mode.
- Run all five positive and three negative test cases.
- Confirm the portal recognizes the verified publisher identity.
- Confirm the listing URLs, logo, privacy policy, terms, and support page are
  publicly reachable.
- Confirm the desired country availability.
