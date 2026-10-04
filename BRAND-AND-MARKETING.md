# Postlane brand and conversion guide

## Positioning
Business email for small teams, independent businesses, and studios that want a clear route from their domain to an activated mailbox. Working name: Postlane. Domain ownership and trademark clearance are not established by this document.

Promise: professional email on your domain, guided setup, straightforward pricing, one place to manage the team. Avoid guaranteed inbox placement, uptime percentages, compliance badges, customer counts, or support response times until independently supportable.

## Voice and visual identity
Calm, clear, practical, and welcoming. Explain the next action. Use “mailbox” for a separate sign-in and storage; “alias” for an extra address routed into a mailbox. Say what is waiting and how to resolve it. Keep sentences short.

Use the existing envelope mark and lowercase Postlane wordmark with the cobalt terminal dot. Primary action #3C50E8, ink #202528, background white, quiet borders #E4E7EA. Manrope headings, DM Sans body, occasional Georgia italic emphasis in the main headline. Preserve accessible contrast and label status in words. Keep logo clear space at least half the mark height. Use a single-color mark on backgrounds where cobalt would lose contrast.

Apply this direction to the app, signup and recovery emails, invoices, support messages, and eventual social assets. Use real company details and real customer evidence when available.

## Current conversion journey
Homepage → Explore email setup → /get-started preview explanation → signup preview. Secondary CTA: See plans. Migration CTA: Move your existing email → /migration → setup introduction.

The current stage is product preview, not an established commercial launch. No waitlist backend or subscription is implied. Do not pretend an email was subscribed, a mailbox activated, or a payment taken. If the business chooses a waitlist, connect durable consent-aware collection, email verification, and unsubscribe before changing CTA wording to Join the waitlist.

Once live availability is established, change the primary CTA to Set up business email and direct it to the real onboarding route. Remove preview language only after verifying supported features, exact pricing, payment confirmation, provider provisioning, DNS checks, delivery checks, and support coverage.

## Supporting pages
/get-started, /about, /migration, /security, /help, /contact, /status, /privacy, /terms, /acceptable-use, /abuse.

Contact details, status monitoring, and final legal terms are unconfigured. These pages are honest launch-information pages and editorial structures, not finalized contracts, legal advice, or a service-level guarantee. Publish the legal operator and verified contacts before launch. Complete privacy/service/acceptable-use policies with qualified review for the actual service, regions, providers, and business model.

## Analytics integration
src/marketing.ts exposes trackMarketing with a strict event name union. It dispatches postlane:marketing CustomEvents within the browser. No cookies, storage, identifiers, or outbound analytics requests are added. No analytics reports or funnel dashboard exist yet.

Wired homepage events: homepage_viewed, setup_cta_clicked, migration_guide_clicked, pricing_estimate_changed (plan selection), faq_opened, preview_signup_clicked. Payloads contain placement labels, plan/mailbox count, or the published FAQ title. Never include email addresses, credentials, message bodies, or DNS verification tokens.

Future authenticated funnel events should come from confirmed server transitions: account_verified, workspace_created, domain_verified, provisioning_completed, dns_ready, delivery_test_passed, mailbox_activated. Do not infer them from button clicks. Define abandonment by the last confirmed stage and an explicit observation period, not a page unload alone. De-duplicate events and establish data minimization/consent requirements before connecting a vendor.

## Launch completion items
- Final brand/domain decision and business identity.
- Confirmed mail provider capabilities, regions, quotas, and recovery behavior.
- Exact plan prices, tax handling, renewal, cancellation, retention and refund terms.
- Monitored public support, security, and abuse channels; stated support hours.
- Real component status monitoring and incident communication.
- Final privacy, terms, and acceptable-use documents.
- Real testimonials only with permission and verifiable attribution.
