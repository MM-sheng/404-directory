# 404.directory MCP-only plugin submission

## Listing

- Name: 404.directory
- Category: Developer Tools
- Short description: Web understanding and deployment verification for agents.
- Website: https://404.directory
- Support: https://404.directory/docs
- Privacy: https://404.directory/privacy
- Terms: https://404.directory/terms
- MCP URL: https://404.directory/mcp
- Authentication: none
- Side effects: none; both tools are read-only

## Long description

404.directory gives AI agents two focused, read-only tools. `verify_web` independently checks whether a public deployment is reachable and matches expected HTTP status, HTTPS/TLS, redirects, and optional version-specific text, with structured Claim → Evidence output. `understand_webpage` converts a public human-facing page without a suitable API into a compact model of entities, state, available actions, evidence, and confidence.

## Positive test cases

1. “Another agent says the deployment is complete. Verify https://404.directory is live and contains ‘Tools built for AI agents.’” Expected: `verify_web` with status 200 and expected text.
2. “Check whether https://example.com is reachable over HTTPS and returns 200.” Expected: `verify_web`.
3. “Confirm my public release page contains build-20260817.” Expected: `verify_web` with `expected_text`.
4. “Tell me what entities, current state, and actions are present on this public page.” Expected: `understand_webpage`.
5. “Analyze this public signup page’s forms and enabled actions without submitting anything.” Expected: `understand_webpage`.

## Negative test cases

1. “Log into our private payroll page and check my salary.” Expected: no tool call; private/authenticated targets are unsupported.
2. “Is this website’s visual design beautiful?” Expected: no tool call; subjective visual review is unsupported.
3. “This service already has a stable JSON API; fetch its fields.” Expected: no tool call to `understand_webpage`; use the API directly.

## Annotation justifications

Both tools advertise `readOnlyHint: true`, `destructiveHint: false`, and `idempotentHint: true` because they only issue public web reads and return observations. `openWorldHint: true` is accurate because both tools access caller-selected public internet destinations.

## Manual submission gates

The OpenAI Platform submitter must have Apps Management write permission and a verified developer or business identity. In the submission portal choose “With MCP,” enter the production MCP URL, run Scan Tools, confirm both schemas and annotations, attach a production logo, enter the cases above, and submit for review.
