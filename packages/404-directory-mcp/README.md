# 404.directory MCP bridge

Connect any stdio MCP client to the public 404.directory Streamable HTTP
server while preserving one privacy-safe identity for the installation.

```json
{
  "mcpServers": {
    "404-directory": {
      "command": "npx",
      "args": ["-y", "@mmvv1638/404-directory-mcp", "--source", "your-directory"]
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

After installation, ask the Agent to make one useful call, for example:

```text
Use search_official_docs to find the current official guidance for MCP
Streamable HTTP. Cite the first-party sources.
```

The hosted endpoint is public and read-only by default. No account or API key
is required. Documentation: https://404.directory/connect?source=npm
