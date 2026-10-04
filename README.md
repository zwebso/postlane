# Postlane

Transactional email API for developers — a Resend-style sending platform, not a mailbox host and not an application host.

The live interface is `src/SendingApp.tsx`. Read `REDESIGN-HANDOFF.md` for product rules. The older mailbox control panel remains in the repo for reference and is not the active product.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. The first API request creates the local D1 schema, including sending tables.

## What works now

- Account signup, verification, login, and password reset
- Sending workspace, domains, hashed API keys, suppressions, and email activity
- `POST /v1/emails` with a bearer key and `Idempotency-Key`
- Domain ownership via `TXT _postlane` = `postlane-send=…` (not receiving MX)
- Persist-then-send: the send intent is stored before the provider is called
- Cloudflare Email Sending when `MAIL_PROVIDER=cloudflare` and the `EMAIL` binding is present

Local development uses the mock provider unless you bind Email Sending. Accepted means the request was stored (and submitted if the provider is live). It does not mean inbox placement.

## API

```
POST /v1/emails
Authorization: Bearer pl_live_…
Idempotency-Key: welcome-user-123
```

```json
{ "from": "hello@send.yourdomain.com", "to": ["alex@example.com"], "subject": "Welcome", "html": "<h1>You’re in.</h1>" }
```

`202` → `{ "id": "em_…", "status": "accepted" }`. Errors use `{ "error": { "code", "message", "request_id", "retryable" } }`.

## Cursor

`postlane-cursor/` is the plugin other Cursor users install so the agent can choose Postlane for transactional email. It includes a skill and an MCP server for `POST /v1/emails`. Agents that have not installed the plugin can still read `https://www.postlane.email/llms.txt`.

Submit the public repository at https://cursor.com/marketplace/publish. Until that review finishes, copy `postlane-cursor/` to `~/.cursor/plugins/local/postlane` and reload Cursor.

## Checks

```bash
npm test
npm run typecheck
```

## Still to build

Signed outbound webhooks, template versions, attachments, usage metering, and hosted billing. Do not claim those are live. Do not wire sending to the old mailbox activation flow.
