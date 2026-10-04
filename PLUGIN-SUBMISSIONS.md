# Postlane plugin submissions

The plugin lives in `postlane-cursor/`. Push it before any submission, because every directory reads from the public GitHub repo.

| Directory | Status | Needs first |
| --- | --- | --- |
| Cursor Marketplace | Submitted Oct 4, 2026 | — |
| Claude directory (claude.ai/directory/manage) | Submitted Oct 5, 2026 from `zwebso/postlane-plugin`, push webhook on | Reviewer clears the credential hold, then select Publish |
| OpenAI (ChatGPT and Codex), skills only | Ready | Verified developer identity on platform.openai.com |
| npm | Published `postlane-mcp@0.1.0` Oct 5, 2026 | — |
| MCP Registry | Published `io.github.zwebso/postlane` Oct 5, 2026 | — |
| Cline MCP Marketplace | Ready | Test an install in Cline from `llms-install.md` |
| Gemini CLI gallery | Pushed to `zwebso/postlane-plugin` with the `gemini-cli-extension` topic Oct 4, 2026 | Wait for the daily crawl |

## Short description (reuse everywhere)

Send transactional email with the Postlane API. Use for welcome mail, password resets, receipts, and notifications.

## Claude Code

Form: https://platform.claude.com/plugins/submit (or https://claude.ai/admin-settings/directory/submissions/plugins/new)

- Repository: https://github.com/zwebso/postlane/tree/main/postlane-cursor
- Check first: `npx @anthropic-ai/claude-code plugin validate postlane-cursor --strict`

Approved plugins appear in `claude-plugins-community`. Pushes to the repo are picked up automatically after approval.

## OpenAI (ChatGPT and Codex)

Portal: https://platform.openai.com → Plugins → Upload new or existing plugin → Skills only.

Build the ZIP from `postlane-cursor/`:

```bash
zip -r postlane-openai-plugin.zip .codex-plugin skills assets/postlane-logo-cursor.png README.md LICENSE
```

The ZIP must not contain `mcp.json`. OpenAI only accepts MCP servers at a public HTTPS URL, and Postlane's server runs locally. A hosted `https://www.postlane.email/mcp` endpoint would let us submit the tools too, but that needs privacy, terms, and support URLs, five positive and three negative test cases, a demo video, and a reviewer account.

## MCP Registry

Run from `postlane-cursor/`:

```bash
npm adduser
npm publish --access public
brew install mcp-publisher
mcp-publisher login github
mcp-publisher publish
```

`mcpName` in `package.json` must match `name` in `server.json`.

## Cline

Open an issue with the template at https://github.com/cline/mcp-marketplace/issues/new?template=mcp-server-submission.yml after `postlane-mcp` is on npm.

- GitHub Repo URL: https://github.com/zwebso/postlane-plugin
- Logo: https://raw.githubusercontent.com/zwebso/postlane-plugin/main/assets/postlane-logo-400.png (400×400)
- Reason for addition:

  > Postlane is a transactional email API. This server lets Cline send a real test email (`send_email`) and check what happened to it (`get_email`, `list_emails`) while it builds welcome, verification, password-reset, and receipt email into an app. Sends require an `Idempotency-Key`, so a retried tool call never sends twice, and the key is read only from the `POSTLANE_API_KEY` environment variable and never logged. `llms-install.md` walks Cline through setup with `npx -y postlane-mcp`.

- Confirm you gave Cline only `llms-install.md` and it set the server up.

## Gemini CLI

The gallery only indexes repos with `gemini-extension.json` at the root, so it needs its own repo:

```bash
git subtree split --prefix postlane-cursor -b plugin-only
gh repo create zwebso/postlane-plugin --public --description "Postlane transactional email for coding agents"
git push https://github.com/zwebso/postlane-plugin.git plugin-only:main
gh repo edit zwebso/postlane-plugin --add-topic gemini-cli-extension
```

The crawler runs daily. Rerun the split and push after each plugin change.
