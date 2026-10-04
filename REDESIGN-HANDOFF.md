# Postlane — developer email platform

Revised 20 September 2026. This document supersedes the mailbox-hosting product direction in earlier design documents. The previous implementation remains in the repository for reference; it is not the active product interface.

## Product and brand

Postlane is an independent transactional email platform for developers. It is not a mailbox subscription, webmail provider, or application hosting service. Positioning: a clear path from send to delivered. Primary homepage CTA: Start building; secondary: Read the docs. No fabricated customers, uptime claims, performance benchmarks, quotas, certifications, or pricing.

Visual language: warm white surfaces, charcoal type, muted olive secondary UI, restrained terracotta brand accent, fine borders, generous space. Typography: Manrope headings and DM Sans body with local system fallbacks. Responsive desktop navigation becomes a mobile drawer. Forms have labels and validation; dialogs support Escape, focus containment, and focus restoration. Respect reduced motion.

## Active implementation

`src/main.tsx` mounts `SendingApp` from `src/SendingApp.tsx`, styled solely by `src/sending.css`. The legacy `App.tsx`, pages, API client, worker, and schema remain intact. `index.html` contains the new product metadata. Do not wire the new screens to old mailbox endpoints: their semantics differ.

The entire new interface is a design sandbox, not production functionality. Data is held in React memory and resets on refresh. Authentication, DNS checks, API keys, email sending, invitations, webhook tests, and billing are explicitly simulated. The proposed API host uses the reserved `.example` domain. No request is sent to it. Demo credentials cannot authenticate anything. Do not enter actual secrets in this preview.

## Page map

Public: `/`, `/signup`, `/login`, `/forgot-password`, `/pricing`, `/docs`, `/about`, `/contact`, `/security`, `/status`, `/privacy`, `/terms`, `/acceptable-use`, `/changelog`.

Workspace: `/app`, `/app/overview`, `/app/setup`, `/app/emails`, `/app/domains`, `/app/api-keys`, `/app/templates`, `/app/webhooks`, `/app/suppressions`, `/app/usage`, `/app/team`, `/app/settings`, `/app/notifications`, `/app/support`.

Email details and domain DNS details are accessible dialogs. Other dialogs: add domain, create/revoke key, simulate sending, add endpoint, add/remove suppression, preview invitation. Unknown routes provide a recovery link.

## Primary flow

1. Explore homepage and docs; enter sandbox through signup.
2. Name the workspace. Production requires verified identity and an abuse eligibility check.
3. Add sending domain; display actual provider-issued ownership and authentication records. Show exact expected/detected values and last check timestamp.
4. Verify domain. Pending, missing, conflicting, invalid, and expired records require separate messages. Do not infer sending readiness from receiving MX records.
5. Create a scoped key, show a real secret once, store only its secure hash, allow revocation and rotation. Preview uses a clearly invalid example.
6. Submit a transactional email from server-side code. Return accepted with a stable ID. Handle idempotency, authorization, content validation, quota and suppression checks.
7. Persist send intent, invoke provider, correlate provider ID, consume delivery events, display timeline.
8. Configure signed webhooks, inspect attempts, handle failures/retries, monitor usage.

## State coverage and remaining design work

Implemented preview: empty email search, filtering, accepted/delivered/deferred/bounced/rejected outcomes, suppression blocking, pending/verified DNS simulations, duplicate domain validation, scoped key creation/revocation, no-key send block, template subject editing/testing, webhook success/failure/retry, suppression removal confirmation, team invitation state, settings save feedback, recovery confirmation, loading-free sandbox entry, and mobile layouts.

Production screens still require connected state work: authentication/verification errors, rate-limit countdown, expired sessions, actual provider outages, durable audit history, domain ownership conflicts across tenants, exhausted allowance, payment failure/dunning, real checkout, invoice downloads, content/attachment template editor, API request log detail, credential rotation, MFA recovery, account deletion/export, and operator abuse review. This prototype establishes the product direction; do not claim these backend features are implemented.

## Proposed backend contract

Prefix `/v1`, scoped bearer credentials for server-to-server endpoints; authenticated browser sessions for workspace administration.

- POST /emails: accepts from, to, subject, html or text, optional template/variables and tags; requires an Idempotency-Key. Returns 202 with id and accepted status.
- GET /emails and GET /emails/:id: tenant-scoped filters, pagination, original request metadata and event timeline; redact sensitive content in logs.
- POST/GET /domains; GET /domains/:id; POST /domains/:id/verify; DELETE only after checking dependencies.
- POST/GET /api-keys; DELETE /api-keys/:id; scopes and allowed domain IDs.
- CRUD /templates with versions; explicit draft vs published state and safely escaped variables.
- CRUD /webhooks, GET /webhooks/:id/attempts, POST /attempts/:id/retry.
- GET/POST/DELETE /suppressions with reason, provenance and audit history. Never bypass complaint suppression casually.
- GET /usage and /billing; payment-provider webhooks are authoritative for entitlements.

Errors use `{error:{code,message,request_id,retryable}}`: invalid_api_key, insufficient_scope, sender_not_verified, invalid_request, recipient_suppressed, quota_exceeded, rate_limited, provider_unavailable. Do not expose provider secrets.

## Data and service design

Entities: users, workspaces, memberships, domains, domain_verifications, api_keys, templates, template_versions, send_requests, messages, message_events, attachments, webhook_endpoints, webhook_attempts, suppressions, usage_ledger, subscriptions, audit_events.

All business rows carry workspace_id. Enforce authorization on every query and mutation. Unique domain ownership is a cross-tenant invariant. Key scopes cannot exceed the issuing member's role. Record immutable usage events rather than trusting browser counters.

Cloudflare can host the frontend and application API. D1 stores metadata; R2 stores private content/attachments where retention policy allows; Queues handle send jobs and webhook delivery; a scheduled reconciler handles stuck jobs and provider state drift. Keep provider adapters replaceable.

Persist send intent before external submission. Model ambiguous provider timeouts explicitly and reconcile before retrying. Deduplicate provider callbacks and webhook event IDs; tolerate out-of-order arrival. Accepted, delivered-to-server, inbox placement, and read status are different concepts. Do not fabricate opens.

Production release gates: actual domain onboarding, arbitrary eligible recipient delivery, sender authentication validation, verified provider eligibility/quotas, tenant isolation, hashed keys, abuse controls, retention and deletion, backups and restoration checks, sender reputation monitoring, retry handling, observability, billing reconciliation, and legal/support configuration.

Cloudflare's documented Email Sending is transactional and in beta. Confirm this multi-customer SaaS use case and account eligibility before promising availability. Its DNS prerequisites and provider limits must inform onboarding, not be hidden behind generic claims. Marketing broadcasts and mailbox/IMAP hosting are outside the initial scope.

## Reference research

Resend's official Email API and webhook pages informed the category scope, not the visual identity:
- https://resend.com/features/email-api
- https://resend.com/changelog/new-domain-webhooks
Cloudflare feasibility references:
- https://developers.cloudflare.com/email-service/reference/faq/
- https://developers.cloudflare.com/email-service/platform/limits/
- https://developers.cloudflare.com/email-service/platform/event-subscriptions/

## Cursor implementation order

1. Keep this UI as the product design reference and keep its sandbox banner until real integration exists.
2. Implement domain ownership and real provider provisioning with audited authorization.
3. Implement scoped API keys, authenticated send requests, idempotency, quotas and suppressions.
4. Implement queued delivery and event reconciliation, then connect email timelines.
5. Implement signed outbound webhooks, templates and attachments with bounded sizes.
6. Implement usage metering, payment entitlements, operations and production hardening.
7. Replace simulated states screen by screen, adding tests at each trust boundary.

Never point customer-facing sending to the old mailbox activation logic or treat the current sandbox login as authentication.

## Visual preference

Do not use diagonal arrow symbols as decoration, button suffixes, table actions, or navigation. Prefer plain text labels such as View and Home.
