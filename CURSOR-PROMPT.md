# Active product direction: Postlane developer email API

Read REDESIGN-HANDOFF.md first. It supersedes the prior mailbox hosting brief.

The active frontend entry is src/main.tsx → src/SendingApp.tsx with src/sending.css. Keep this independent design. The frontend is the product UI. Signed-in workspaces use `/api/sending/*` and `/v1/emails`. Unauthenticated `/app` still shows labelled sample data.

Implement the backend in the order specified by the handoff. Preserve tenant isolation, scoped and hashed credentials, idempotency, truthful delivery states, provider eligibility checks, quota enforcement, suppression handling, signed webhooks, and durable metering. Keep the sandbox labels until each screen has real, verified integration.

Legacy mailbox pages, API routes and schema are retained for reference. Do not reuse them as if they implement the new sending platform. Do not deploy or migrate production data as part of a design change.
