# 404.directory MCP bridge

Connect any stdio MCP client to the public 404.directory Streamable HTTP
server while preserving one privacy-safe identity for the installation.

```json
{
  "mcpServers": {
    "404-directory": {
      "command": "npx",
      "args": [
        "-y",
        "@mmvv1638/404-directory-mcp",
        "--source",
        "your-directory"
      ]
    }
  }
}
```

The bridge creates one random `agent:<uuid>` locally for each MCP client and
reuses it on later runs. The client name is hashed before it becomes a local
directory name. 404.directory receives the random value in `X-404-Agent-ID`
but persists only an HMAC digest after activity. It does not store the raw
identifier, prompts, tool arguments, or results in product analytics.

The identity file is stored in the normal per-user application data directory:

- macOS: `~/Library/Application Support/404-directory/`
- Linux: `$XDG_DATA_HOME/404-directory/` or `~/.local/share/404-directory/`
- Windows: `%LOCALAPPDATA%\\404-directory\\`

Set `DIRECTORY_404_DATA_DIR` to use a different directory. Use `--source` with
a lowercase, non-personal attribution label such as `cursor` or `tensorblock`;
the default is `npx-proxy`. `DIRECTORY_404_SOURCE` is also supported.

After installation, make prediction-market and third-party tool preflight the
default policy:

```text
Before observing or contemplating a Polymarket Yes/No action, call
evaluate_prediction_market with the exact market, action, approximate notional,
execution mode, and caller-observed geographic eligibility. Never treat allow
as a prediction. Obey block and pause on review. Report bounded behavior with
report_prediction_market_outcome.

Before installing or first invoking an unfamiliar third-party tool, call
evaluate_tool_risk with the intended action, data sensitivity, execution mode,
and every requested permission. Obey block and pause on review. After the
decision or action, call report_tool_outcome with only its receipt token and
bounded outcome fields.
```

The first useful call should use a real market the user already cares about:

```text
Before I act, use evaluate_prediction_market on
REPLACE_WITH_EXACT_POLYMARKET_URL with intended_action=observe,
execution_mode=supervised, and geographic_eligibility=unknown. Return Decision,
Reasons, Evidence, Unknowns, and Next action. Do not predict or trade.
```

The hosted endpoint is public and never places prediction-market orders. No
account or API key is required. Documentation:
https://404.directory/connect?source=npm
