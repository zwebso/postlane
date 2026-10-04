# Postlane — email hosting product design

Version 1 · 19 September 2026 · Working brand, illustrative commercial terms

## Deliverables and scope

Open `dist/index.html` in a browser, or serve `dist` with any static web server. The prototype is plain HTML/CSS/JavaScript for portability into Cursor. It includes 22 screen destinations, a six-step activation wizard, nine selectable scenarios, responsive layouts, dialogs, and simulated actions. Choose screens and scenarios in the dark review toolbar; remove that toolbar from the production application.

This is a design-first product template, not an operational hosting service. Sample domains, DNS targets, prices, storage amounts, invoices, jobs, and messages are illustrative. Actions do not call payment, DNS, identity, or email providers. State resets on refresh. Some management dialogs preview the intended action rather than persisting changes. Webmail is a visual sample, not a complete email client. No public marketing site, domain registrar, or production infrastructure is included.

## Product decision

Audience: small businesses and teams who already own a domain. Primary promise: understand the next step, finish setup without guessing, and know whether email actually works. Postlane is a replaceable working name, not a cleared trademark. Hostinger and Render are usability references, not visual templates to copy.

Build the control panel around a proven mail service integration. The web application owns accounts, workspaces, subscriptions, domain setup, provisioning orchestration, and observability. A mail provider owns actual SMTP/IMAP delivery, message storage, spam filtering, queues, and reputation. If you later operate mail servers yourself, treat that as a separate operational program; generating a web backend does not deliver reliable email hosting.

## Visual system

White surfaces; cool gray page background; graphite text; cobalt primary actions. Status colors are semantic and paired with text. Use Manrope for headings and DM Sans for controls/body, with system fallbacks. The prototype loads fonts from Google Fonts; self-host approved font assets in production if required.

Tokens: background #F7F8FA; surface #FFFFFF; text #17202E; muted #68717F; stroke #E5E8EE; action #3456E8; success #187355; warning #94601C. Radii: 8px controls, 12px containers. Spacing: 4/8/12/16/24/32/48. Main copy 16px; routine controls 14px; secondary metadata 12px minimum. Some compact review metadata is 11px in this prototype and should be increased for production accessibility validation.

Desktop: 232px persistent navigation, 77px header, max 1320px working canvas, two-column operational content when useful. Tablet: supporting information moves below primary content. Mobile: navigation becomes horizontal in the prototype; production should use an accessible menu drawer with all destinations. Tables scroll inside their containers. Forms remain single-column. Avoid fixed heights for content and support 200% zoom.

Primary button means the next meaningful action. Secondary actions use neutral borders; low-priority links use text. Persistent warnings belong next to the affected resource, not just in a disappearing toast. Every icon-only control needs a descriptive accessible name. Modals must trap focus, support Escape, and return focus to the trigger.

## Activation journey

1. Sign up using an existing, reachable email address. Verify it before allowing consequential workspace actions. Keep recovery outside the hosted domain.
2. Create workspace and choose a plan. Show seat count, billing interval, taxes, prorated amount, renewal, and trial rules before purchase. Provider payment confirmation, not the browser success redirect, establishes entitlement.
3. Enter domain. Normalize IDNs using a supported library, reject URLs, establish authoritative DNS provider, inspect current mail configuration, and verify ownership with an unpredictable workspace-bound TXT token.
4. Prepare every destination mailbox and alias. For existing email, record migration intent and finish address mapping before cutover. Display preparation/provisioning independently from delivery readiness.
5. Configure mail DNS. Show record type, relative host, full expected hostname, exact value, TTL, MX priority, detected value, last check, and corrective action. Existing MX/SPF/DKIM/DMARC must be inspected and preserved or intentionally replaced. The prototype abbreviates these details for layout.
6. Verify both delivery directions and provider readiness. Show success only when all required gates pass. Give webmail access, mail-client settings, and the option to invite teammates.

Dashboard groups this into five user outcomes: workspace ready, domain owned, mailboxes prepared, DNS connected, delivery verified. Billing selection is inside workspace preparation; the wizard therefore has six screens while the dashboard has five outcomes.

Never promise a fixed DNS propagation time or guaranteed inbox placement. Show last checked, next scheduled check, retry action, and saved progress. Let users leave the setup and resume from server state.

## Screen inventory and production routes

### Account access

- `/signup`: name, external email, password or supported identity provider, consent links; duplicate account, invalid input, pending verification, rate limit.
- `/verify-email`: sent message, resend cooldown, verified, expired, invalid/already-used token; change mistyped address with appropriate verification.
- `/login`: credentials, SSO if chosen, MFA challenge, recovery code, generic invalid credentials, locked account, service outage.
- `/forgot-password`: generic response regardless of whether the account exists; cooldown and resend.
- `/reset-password`: valid/expired token, password policy, mismatch, success, session invalidation.
- `/invitations/:token`: workspace and role, correct account check, accept/decline; expired, revoked, already accepted, wrong recipient.

Prototype: six separate access screens, with basic validation and simulated success. MFA challenge, expired links, and lockouts are specified extensions rather than individually rendered screens.

### Onboarding and workspace

- `/w/:workspace/overview`: progress, next action, resource status, activity; new workspace, in progress, healthy, degraded, suspended.
- `/w/:workspace/setup/:step`: six wizard screens above; resume, back, validation, payment failure, DNS waiting/conflict, provisioning failure, activation.
- `/w/:workspace/domains`: list, ownership/routing/authentication status; empty, checking, connected, attention required.
- `/w/:workspace/domains/:domain`: DNS records, check history, provider guidance, migration link, disconnect dependencies. Prototype opens the DNS wizard rather than a separate detail route.
- `/w/:workspace/mailboxes`: create/list/search/filter, seat capacity, status, storage; empty, duplicate username, quota reached.
- `/w/:workspace/mailboxes/:mailbox`: identity, quota, aliases, access reset, connection settings, suspension, export, deletion. Prototype uses a management dialog and connection tab.
- `/w/:workspace/aliases`: address/destination mapping, catch-all, duplicate namespace, external forwarding verification, loop detection. Start with local aliases; external forwarding needs explicit product policy.
- `/w/:workspace/migrations`: connection, recipient mapping, import job, progress, errors, pause/resume, cutover checklist, final sync. Prototype shows preparation and sample job dialog.
- `/mail`: provider webmail handoff preferred for the first release. Prototype contains an inbox, sample message, and compose dialog. A custom client additionally needs folders, search, threads, drafts, attachments, spam, trash, pagination, contacts, offline behavior, accessibility, and send-failure recovery.

### Account management

- `/w/:workspace/billing`: plan, entitlement, usage, renewal, payment method, invoices, tax information, update/downgrade/cancel/reactivate. Past due and suspended are distinct; retention and grace periods are product decisions, not invented promises.
- `/w/:workspace/team`: invitations and roles. Owner manages all; admin manages resources; billing manages invoices/subscription; member sees permitted mailbox resources only. Owner transfer requires reauthentication, acceptance, and a safe rollback policy. Keep at least one owner.
- `/account/security`: MFA enrollment/recovery, password changes, sessions, app passwords, security events.
- `/w/:workspace/settings`: display name, contact, time zone, notification defaults; destructive workspace deletion is a separate reauthenticated flow with dependency and retention review.
- `/w/:workspace/notifications`: unread/read events and preferences. Critical security, billing deadlines, and service impact must remain discoverable.
- `/w/:workspace/activity`: filterable audit trail and operational events with correlation IDs, actors, timestamps, results. Do not expose credentials or message content.
- `/support`: troubleshooting, request form, ticket detail, incident status, permission-aware diagnostic context. Never ask for passwords.

### Staff-only operations

- `/ops`: tenants, provisioning failures, queue health, provider health, reconciliation, abuse cases, incidents. Distinct staff authentication and authorization boundary.
- `/ops/jobs/:job`: attempts, sanitized failure, correlation, safe retry, reconciliation.
- `/ops/abuse/:case`: aggregate evidence, temporary sending limits, reason, owner notification, appeal, audited resolution.
- `/ops/incidents/:incident`: affected components/regions, status updates, notification scope, resolution.

Prototype: one combined operations screen with sample job inspection and abuse review. These production detail routes are specified, not implemented.

### Public and policy surfaces needed before launch

Product/pricing, sign-in entry, service status, help documentation, terms, privacy, acceptable use, security contact, and abuse report. These are launch requirements documented here; the current prototype focuses on the authenticated product, not a marketing site. Legal terms and commercial policies require the business's actual decisions and approved copy.

## State and recovery design

Use multiple independent state dimensions rather than one `is_active` flag:

- Account: unverified → verified → locked/disabled.
- Subscription: pending → active → past_due → suspended → cancelled, according to configured policy.
- Ownership: unverified → checking → verified → revalidation_required.
- DNS component: unknown → checking → pending/valid/conflict/error. Track MX, SPF, DKIM, DMARC separately.
- Mailbox: requested → provisioning → prepared → active → suspended → deleting → deleted; failed jobs can retry after reconciliation.
- Delivery checks: not_run → running → passed/failed/timeout, independently for inbound and outbound.
- Migration: draft → validating → queued → copying → partial/completed/failed/paused → final_sync.

Recommended activation gate: verified account + ownership + valid entitlement + provider mailbox ready + valid required routing/authentication + successful inbound and outbound checks. DMARC enforcement policy should remain a separate assessment; do not jump directly to reject while unknown legitimate senders exist. After activation, degraded DNS should show a specific degraded status and trigger the configured sending policy rather than erase the mailbox or its history.

Error copy pattern: what happened; what remains safe; one next action; diagnostic detail behind expansion. Never convert provider timeouts into “invalid DNS.” Never retry a charge or resource creation blindly.

Required edge cases:

- Domain already claimed: generic conflict plus ownership review path; never reveal another customer's identity.
- Wrong DNS provider / duplicated hostname / proxied CNAME / conflicting CNAME: show expected versus observed record and provider-specific correction.
- Multiple SPF policies: explain merge into one record; preserve legitimate senders; validate lookup limits and syntax.
- Existing provider: cutover confirmation only after recipient map and migration plan; changing MX redirects incoming mail.
- DNS wait: persisted progress, background checks, last/next check, manual retry rate limit.
- Payment timeout: pending confirmation, webhook reconciliation, no duplicate charge.
- Provisioning partial failure: show which mailboxes succeeded; retry only failed resources.
- Storage full: received/sent behavior based on actual provider, storage cleanup or upgrade CTA, no false “healthy.”
- Mailbox deleted/suspended: explain status and recovery options according to real retention policy.
- Network offline/session expired: preserve safe non-secret input; reauthenticate; reconcile before resubmitting.
- Concurrent changes: version conflict with reload/review; never silently overwrite.
- Unauthorized/404/500: explain access or unavailability without leaking resource existence; offer safe navigation.
- Abuse suspension: restrict affected capabilities, show reason and appeal; preserve data per policy.

The toolbar renders nine review scenarios. Additional edge cases above are acceptance requirements for the next implementation pass, not claims that every variant is already rendered.

## Notifications

Persist notifications with event key, workspace/resource, severity, unread state, timestamp, destination, and action URL. Deduplicate by event/resource/state transition. Display “domain ready” once, not on every poll.

- Verification / invitation / reset: transactional email, expiration, resend cooldown, single-use token.
- Setup blocked: in-app task; optional recovery-email reminder with bounded frequency.
- Domain ready / provisioning failed: in-app and recovery email, with resource-specific CTA.
- DNS degradation / mailbox quota / service impact: persistent resource banner plus notification; resolve when state improves.
- Payment failed / suspension deadline: owner and billing contact; show exact deadline only from configured policy.
- Password/MFA/session changes: security contact; include time and revocation/recovery action.
- Migration complete/partial failure: job summary, skipped items, safe retry action.
- Product updates: opt-in preference; separate from essential account messages.

Do not send setup/recovery messages only to an unactivated mailbox. Do not put secrets or message bodies into notification payloads.

## Backend architecture handoff

Recommended logical structure is provider-neutral. Choose supported libraries and versions at implementation time after inspecting the Cursor project.

Browser UI → authenticated application API → relational database + durable job queue → provider adapter → mail service. Billing webhooks → verified event inbox → entitlement reconciliation. DNS worker → authoritative/resolver checks → recorded observations → state derivation. Notification worker → email delivery service independent of the customer's newly hosted domain.

Start with a modular application and a worker process, not speculative microservices. Keep provider integration behind an interface so commercial or operational choices can change. Use a relational database for transactional resource ownership and jobs; object storage for explicit export/import artifacts where needed. The mail provider remains the canonical store for messages unless you deliberately build and operate the mail plane.

Modules: Identity, Workspaces/RBAC, Domains/DNS, Mailboxes/Aliases, Subscriptions/Entitlements, Provisioning, Migration, Notifications, Audit, Operations.

Core entities:

- User; Workspace; Membership (unique workspace/user); Invitation (hashed token, expiry).
- Domain (normalized name unique according to product claim policy, workspace, verification metadata).
- DNSRequirement and DNSObservation (expected values versus timestamped actual results; never infer success from a browser checkbox).
- Mailbox (workspace/domain/address/provider ID/status/quota; unique normalized address).
- Alias (unique address in the shared mailbox/alias namespace, destination, forwarding verification).
- Subscription; InvoiceReference; BillingEvent (unique external event ID).
- ProvisioningJob (idempotency key, state, attempts, provider reference, sanitized error).
- DeliveryCheck (direction, correlation token, timeout, evidence).
- MigrationJob and per-mailbox/item checkpoints.
- Notification; AuditEvent; Incident; SupportTicket; AbuseCase.

Every tenant-owned query must enforce workspace access server-side. A client-provided workspace ID is not authorization. Enforce uniqueness transactionally and reconcile with the provider before retry. Use a transactional outbox or equivalent to keep committed mutations and queued work consistent.

Illustrative endpoint contracts:

- POST `/api/workspaces`: validated name; returns workspace and permitted actions.
- GET `/api/workspaces/:id/setup`: independent statuses, next action, blocking reasons, version.
- POST `/api/workspaces/:id/domains`: normalized domain; generates verification requirements.
- POST `/api/domains/:id/checks`: rate-limited asynchronous DNS job; returns 202 and job ID.
- GET `/api/domains/:id/dns`: expected/detected records, resolver evidence, timestamps, correction codes.
- POST `/api/domains/:id/mailboxes`: username/display name/entitlement revision plus idempotency key; returns 202 resource/job.
- GET `/api/jobs/:id`: pending/running/succeeded/failed with safe retry metadata.
- POST `/api/mailboxes/:id/delivery-checks`: authorized destination, controlled inbound/outbound checks, bounded rate.
- POST `/api/billing/checkout`: provider-hosted session; exact commercial summary.
- POST `/api/webhooks/billing`: signature/timestamp validation, replay protection, durable deduplication.
- POST `/api/migrations`: encrypted provider authorization reference; no plaintext secrets in API logs.
- GET/PATCH `/api/notifications`: permission-filtered list and read/preference updates.
- DELETE `/api/mailboxes/:id`: reauthentication where required, dependency review, retention policy, async provider deletion.

Error envelope: `{code, message, fieldErrors, resourceId, retryable, retryAfter, correlationId}`. Use stable codes such as DNS_PENDING, SPF_MULTIPLE_RECORDS, DOMAIN_CLAIM_CONFLICT, PAYMENT_PENDING, ENTITLEMENT_REQUIRED, PROVISIONING_FAILED, QUOTA_EXCEEDED, FORBIDDEN. Return only safe details.

DNS workers: inspect authoritative DNS and selected recursive resolvers; track TTL and observation freshness; bounded retries/backoff/jitter; distinguish NXDOMAIN, empty answer, SERVFAIL, timeout, and mismatched value. Mail test workers: correlate controlled messages with server evidence, avoid unsolicited tests, define timeouts, and do not claim inbox placement.

Operations: sanitized structured logs, metrics, correlation IDs, queue dead letters, reconciliation tasks, backup/restore drills, provider quota monitoring, rate limits, outbound abuse controls, tenant limits, and incident communications. Do not log credentials, tokens, or message bodies.

## Build sequencing

1. Reproduce the responsive UI in the existing Cursor stack with reusable components, route boundaries, fixtures, and a scenario viewer in development only.
2. Implement identity, workspace roles, persistent setup state, and access control. Test tenant isolation early.
3. Integrate one actual mail provider behind an adapter; verify licensing, provisioning capabilities, limits, regions, and commercial terms before committing.
4. Implement billing and asynchronous provisioning with idempotency and webhook reconciliation.
5. Implement real DNS evaluation and delivery checks. The server becomes the only authority for readiness.
6. Add migrations, aliases, notifications, security controls, and staff tools based on confirmed provider capabilities.
7. Validate the complete fresh-domain and existing-provider journeys, failure recovery, accessibility, responsive layout, and operational readiness before launch.

## Acceptance criteria

A new customer can finish account verification, understand price, verify a domain, prepare recipients, configure DNS, and prove send/receive delivery without support. An existing customer can migrate without being encouraged to cut over prematurely. A failed check never loses progress. A successful retry never duplicates a charge or mailbox. Refresh resumes the authoritative state. Cross-tenant access is denied on every server route. Notifications reach an accessible contact and are deduplicated. Keyboard users can complete the flow; validation is associated with fields; focus is visible; status updates are announced. Mobile works without page-level horizontal overflow. Destructive actions explain consequences and use the real retention policy.

## Technical references used

- SPF standard: https://www.rfc-editor.org/info/rfc7208/ — one applicable SPF record, evaluation semantics, DNS lookup constraints.
- Google Workspace MX setup: https://support.google.com/a/answer/87127 — MX controls incoming delivery; use the selected mail provider's actual values.
- Google Workspace SPF setup: https://support.google.com/a/answer/33786 — account for all authorized senders; provider-specific configuration.
- Google sender guidelines: https://support.google.com/mail/answer/81126 — authentication and sender practices; authentication alone does not guarantee inbox placement.

These sources informed setup safeguards, not the illustrative DNS targets or a claim that Postlane is compatible with a particular provider.
