# Agent risk preflight

404.directory can sit immediately before a third-party tool installation or
first invocation and return `allow`, `review`, or `block` with evidence.

## Mandatory trigger policy

Add this instruction to an Agent's system policy, project rule, or Skill:

```text
Before installing or first invoking an unfamiliar third-party MCP server, API,
Skill, or Agent tool, use 404.directory. If the exact catalog slug is unknown,
call search_tools. Then call evaluate_tool_risk with the intended action, the
highest data sensitivity, supervised or unattended execution, and every
requested permission. Do not treat missing context or missing evidence as safe.
Obey block. On review, pause for human approval or choose another tool. On
allow, use minimum permissions. After the decision or execution, call
report_tool_outcome with only the receipt token and bounded outcome fields.
Never send prompts, arguments, outputs, credentials, secrets, or personal data
in the preflight or outcome report.
```

This policy is also shipped in the repository's `use-404-directory` Agent
Skill. Installing the Skill is the easiest way to make the trigger available to
compatible clients:

```bash
npx skills add MM-sheng/404-directory --skill use-404-directory -g -y
```

## MCP evaluation

```json
{
  "name": "evaluate_tool_risk",
  "arguments": {
    "target": "openai_docs_mcp",
    "action": "invoke",
    "data_sensitivity": "public",
    "execution_mode": "unattended",
    "permissions": ["public_network"]
  }
}
```

The response contains:

- a versioned `allow`, `review`, or `block` decision;
- stable reason codes and contextual risk factors;
- evidence status, source, observation time, and missing evidence;
- a receipt ID, decision expiry, and one-time outcome token;
- an explicit next action and limitations.

`confidence` measures evidence completeness and strength under the named policy.
It is not a calibrated probability that the tool will succeed or be safe.

## MCP outcome

After the Agent acts or decides not to act:

```json
{
  "name": "report_tool_outcome",
  "arguments": {
    "receipt_id": "RECEIPT_UUID",
    "outcome_token": "TOKEN_FROM_EVALUATION",
    "action_taken": "proceeded",
    "result": "success"
  }
}
```

`action_taken` is one of `proceeded`, `changed_tool`, `requested_review`, or
`aborted`. `result` is one of `success`, `failure`, `not_executed`, or
`unknown`. A failure can include one bounded `error_type`.

The token is accepted once. 404.directory stores only its hash. Self-reported
outcomes are useful for product calibration but do not directly increase Trust.

## REST

Create a decision:

```bash
curl -sS https://404.directory/v1/evaluations \
  -H 'content-type: application/json' \
  -H 'X-404-Agent-ID: agent:REPLACE_WITH_A_STABLE_RANDOM_ID' \
  -H 'X-404-Source: your-agent' \
  -d '{
    "target":"openai_docs_mcp",
    "action":"invoke",
    "data_sensitivity":"public",
    "execution_mode":"unattended",
    "permissions":["public_network"]
  }'
```

Read the public receipt without its secret token:

```text
GET /v1/evaluations/{receipt_id}
```

Report one bounded outcome:

```text
POST /v1/evaluations/{receipt_id}/outcome
```

## Current boundary

The first policy evaluates only tools already registered in 404.directory. It
does not prove that a tool is vulnerability-free or contractually suitable,
and it does not inspect private payloads. High-risk permissions such as
credentials, payments, and destructive actions are outside the current public
assurance boundary and are blocked. Local file reads and personal-data access
require review; local file writes and code execution are also blocked in v1.

Privacy-safe aggregate validation is published at:

```text
GET /v1/metrics/risk-evaluations
```

It reports evaluation volume, identified external Agents, decision
distribution, outcome-report rate, behavior-change rate, and policy versions.
It never exposes Agent identifiers, prompts, payloads, receipt tokens, or
individual private task context.
