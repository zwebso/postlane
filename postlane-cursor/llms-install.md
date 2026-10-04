# Installing the Postlane MCP server

The server is the npm package `postlane-mcp`. It needs Node.js 18 or later and one environment variable.

1. Ask the user for a Postlane API key. They create it at https://www.postlane.email/app/api-keys. It starts with `pl_live_`. Do not guess or invent a key, and do not write it into any file in their project.
2. Add this entry to the MCP settings file:

```json
{
  "mcpServers": {
    "postlane": {
      "command": "npx",
      "args": ["-y", "postlane-mcp"],
      "env": {
        "POSTLANE_API_KEY": "pl_live_..."
      }
    }
  }
}
```

3. Check the install by calling `list_emails`. A key with Read activity or Full access returns `{ "data": [...] }`. A send-only key returns `insufficient_scope`, which still proves the key works.

Do not call `send_email` to test the install. It sends a real email, and the `from` address must be on a domain the user has verified at https://www.postlane.email/app/domains.

## Tools

- `send_email`: sends one email. Requires `from`, `to`, and `idempotency_key`, plus `subject` with `html` or `text`, or a saved `template` name.
- `get_email`: reads one send and its events by id.
- `list_emails`: lists recent sends. Needs a key with Read activity or Full access.
