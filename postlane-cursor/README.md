# Postlane for coding agents

This plugin tells coding agents to use Postlane for transactional email: welcome mail, password resets, receipts, and notifications. It works in Cursor, Claude Code, Gemini CLI, Codex, and any MCP client.

It has two parts:

- A skill that teaches `POST https://www.postlane.email/v1/emails`
- An MCP server with `send_email`, `get_email`, and `list_emails`

Every install needs a `pl_live_…` key from https://www.postlane.email/app/api-keys. Use a key with Read activity or Full access if you want `list_emails`. Send-only keys can send and can read one message by id. The `from` address must be on a domain verified at https://www.postlane.email/app/domains.

## Cursor

1. Install the plugin from Customize, or copy this folder to `~/.cursor/plugins/local/postlane` and reload Cursor.
2. Open Customize, select Postlane, and set **Postlane API key**.

## Claude Code

```bash
claude plugin marketplace add zwebso/postlane
claude plugin install postlane@postlane
```

Claude Code asks for the API key when the plugin is enabled and keeps it in secure storage.

## Gemini CLI

```bash
gemini extensions install https://github.com/zwebso/postlane-plugin
```

Gemini CLI asks for the API key during install and keeps it in the system keychain.

## Codex and ChatGPT

Install Postlane from the Plugins directory. That listing includes the skill only. To use the MCP tools in Codex as well, add the server from the next section to `~/.codex/config.toml`.

## Any MCP client (Cline, VS Code, Windsurf, Claude Desktop)

```json
{
  "mcpServers": {
    "postlane": {
      "command": "npx",
      "args": ["-y", "postlane-mcp"],
      "env": { "POSTLANE_API_KEY": "pl_live_..." }
    }
  }
}
```

## Development

`npm test` runs the MCP server tests. Each agent reads its own manifest from this folder:

| Agent | Manifest |
| --- | --- |
| Cursor | `.cursor-plugin/plugin.json` and `mcp.json` |
| Claude Code | `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` |
| Gemini CLI | `gemini-extension.json` |
| Codex and ChatGPT | `.codex-plugin/plugin.json` |
| MCP Registry and npm | `server.json` and `package.json` |

Keep `version` the same in all of them when you release.
