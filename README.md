# Postlane

[Postlane](https://www.postlane.email) is a transactional email API. Applications use it to send welcome messages, address verification, password resets, and receipts from a verified domain.

Postlane is not an inbox, and it does not provide IMAP or hosted mailboxes.

- Product: [https://www.postlane.email](https://www.postlane.email)
- Docs: [https://www.postlane.email/docs](https://www.postlane.email/docs)
- Pricing: [https://www.postlane.email/pricing](https://www.postlane.email/pricing)
- Sign in: [https://www.postlane.email/login](https://www.postlane.email/login)

## Send

Create a key at [API keys](https://www.postlane.email/app/api-keys) after you [verify a sending domain](https://www.postlane.email/app/domains). The secret is shown once and starts with `pl_live_`. Keep it on your server.

```http
POST https://www.postlane.email/v1/emails
Authorization: Bearer pl_live_…
Content-Type: application/json
Idempotency-Key: welcome-user-123
```

```json
{
  "from": "hello@send.yourdomain.com",
  "to": ["alex@example.com"],
  "subject": "Welcome",
  "html": "<h1>You’re in.</h1>"
}
```

A successful response is `202` with `{ "id": "em_…", "status": "queued" }`. `queued` means the message was accepted for delivery. It does not mean the message is in the inbox. Repeating the same `Idempotency-Key` returns the original result and does not send again.

Errors use `{ "error": { "code", "message", "request_id", "retryable" } }`. The same contract is published for agents at [https://www.postlane.email/llms.txt](https://www.postlane.email/llms.txt).

## Cursor

`postlane-cursor/` is the Postlane plugin for Cursor. It teaches `POST /v1/emails` and exposes `send_email`, `get_email`, and `list_emails`. The API key is a plugin setting. It is not stored in this repository.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The first API request creates the local database schema. Local sends use a mock provider unless Email Sending is bound. `accepted` in that mode means the request was stored, not delivered.

```bash
npm test
npm run typecheck
```

Signed webhook delivery, attachments, and template versions are not part of the public API yet.
