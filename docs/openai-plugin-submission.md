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
- **Short description:** Official docs search and trusted read-only tools for AI Agents.
- **Long description:** 404.directory helps AI Agents search current official
  OpenAI, Microsoft Learn, AWS, and Cloudflare documentation; understand and
  verify public webpages; and discover, compare, inspect, and safely invoke
  curated read-only MCP tools using transparent trust metadata.
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
- **Tool count:** 12

Every tool declares `readOnlyHint`, `destructiveHint`, and `openWorldHint`.
All tools are read-only and declare `destructiveHint: false`. Tools that access
public webpages or remote first-party documentation declare
`openWorldHint: true`; catalog-only discovery tools declare
`openWorldHint: false`.

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

1. Search current official OpenAI documentation for remote MCP server setup and
   cite the first-party sources.
2. Compare the trust profiles of the registered official documentation tools
   and explain which one fits my task.
3. Verify that my public deployment returns the expected status and release
   string, then show the evidence.
4. Explain the current state, entities, forms, and available actions on this
   public webpage without clicking anything.

## Positive test cases

### 1. Current official OpenAI documentation

**Prompt:** Search current official OpenAI guidance for remote MCP servers in
the Responses API and cite the first-party sources.

**Expected:** Calls `search_official_docs` with the OpenAI source selected or
with all sources enabled; returns a non-error result; cites OpenAI developer
documentation; distinguishes sourced facts from inference.

### 2. Current AWS documentation

**Prompt:** Find the current official AWS guidance for choosing a region for an
Amazon Bedrock workload. Cite the source.

**Expected:** Calls `search_official_docs`; returns first-party AWS results and
provenance; does not fabricate regional availability.

### 3. Trust-aware tool inspection

**Prompt:** Show why `openai_docs_mcp` is or is not trustworthy enough for
read-only documentation research.

**Expected:** Calls `get_tool` and/or `get_trust_score`; reports ownership,
availability, compatibility, security, and usage dimensions rather than only a
single rank; notes that trust metadata is evidence, not a guarantee.

### 4. Deployment verification

**Prompt:** Verify that https://404.directory/health returns HTTP 200 and
contains the release string `0.8.5`.

**Expected:** Calls `verify_web` with explicit expected status and text; reports
Claim → Evidence → Result; includes final URL, HTTP status, TLS/redirect evidence,
and whether the text matched.

### 5. Public webpage understanding

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
`use-404-directory` Agent Skill. The service provides 12 public read-only tools,
standard MCP discovery metadata, explicit safety annotations, privacy-safe
optional Agent attribution, and no-account access.

## Final pre-submit checks

- Validate `.codex-plugin/plugin.json` with the official Plugin Creator
  validator.
- Connect `https://404.directory/mcp` in ChatGPT Developer Mode.
- Run all five positive and three negative test cases.
- Confirm the portal recognizes the verified publisher identity.
- Confirm the listing URLs, logo, privacy policy, terms, and support page are
  publicly reachable.
- Confirm the desired country availability.
