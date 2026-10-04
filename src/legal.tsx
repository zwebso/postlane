import { useEffect } from "react";
import { Link } from "react-router-dom";

const EFFECTIVE = "5 October 2026";
const COMPANY = "TMD SPACE CO., LTD.";
const ADDRESS = "466/31 House Sathon Building, 6th Floor, Soi Suanplu, Thung Maha Mek, Sathon, Bangkok 10120, Thailand";
const EMAIL = "info@tmdspace.com";
const PHONE = "+66 (0)2 679 3585";

function Mail() {
  return <a href={`mailto:${EMAIL}`}>{EMAIL}</a>;
}

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const privacy = kind === "privacy";
  useEffect(() => {
    const previous = document.title;
    document.title = privacy ? "Privacy Policy — Postlane" : "Terms of Service — Postlane";
    return () => {
      document.title = previous;
    };
  }, [privacy]);

  return (
    <article className="pl-legal">
      <p className="pl-eyebrow">{privacy ? "PRIVACY POLICY" : "TERMS OF SERVICE"}</p>
      <h1>{privacy ? "Privacy Policy" : "Terms of Service"}</h1>
      <p className="pl-legal-lead">
        {privacy
          ? "This notice explains how Postlane handles personal data for the transactional email service at postlane.email."
          : "These terms are the agreement for using Postlane, the transactional email API at postlane.email."}
      </p>
      <dl className="pl-legal-meta">
        <div><dt>Operator</dt><dd>{COMPANY}</dd></div>
        <div><dt>Service</dt><dd>Postlane · <a href="https://www.postlane.email">www.postlane.email</a></dd></div>
        <div><dt>Effective</dt><dd>{EFFECTIVE}</dd></div>
        <div><dt>Contact</dt><dd><Mail /> · {PHONE}</dd></div>
      </dl>
      <p className="pl-legal-switch">
        {privacy ? <Link to="/terms">Read the Terms of Service</Link> : <Link to="/privacy">Read the Privacy Policy</Link>}
        <Link to="/acceptable-use">Acceptable use</Link>
        <Link to="/contact">Contact</Link>
      </p>
      <nav className="pl-legal-toc" aria-label="On this page">
        {(privacy ? privacyToc : termsToc).map(([href, label]) => (
          <a key={href} href={href}>{label}</a>
        ))}
      </nav>
      {privacy ? <PrivacyBody /> : <TermsBody />}
    </article>
  );
}

const privacyToc: [string, string][] = [
  ["#who", "Who we are"],
  ["#scope", "What this covers"],
  ["#roles", "Controller and processor"],
  ["#collect", "Information we collect"],
  ["#use", "How we use it"],
  ["#bases", "Why we may process it"],
  ["#share", "Who receives it"],
  ["#transfers", "International transfers"],
  ["#retention", "How long we keep it"],
  ["#security", "Security"],
  ["#rights", "Your rights"],
  ["#cookies", "Cookies"],
  ["#children", "Children"],
  ["#changes", "Changes"],
  ["#contact", "How to reach us"],
];

const termsToc: [string, string][] = [
  ["#agreement", "The agreement"],
  ["#service", "The service"],
  ["#accounts", "Accounts and teams"],
  ["#content", "Content and domains"],
  ["#use", "Acceptable use"],
  ["#fees", "Plans, fees, and taxes"],
  ["#delivery", "Limits and delivery"],
  ["#processing", "Privacy and processing"],
  ["#suspension", "Suspension and ending"],
  ["#ip", "Intellectual property"],
  ["#liability", "Warranties and liability"],
  ["#law", "Law and notices"],
];

function PrivacyBody() {
  return (
    <div className="pl-legal-body">
      <section id="who">
        <h2>1. Who we are</h2>
        <p>
          Postlane is operated by {COMPANY} (“TMD SPACE”, “we”, “us”). Our registered office is {ADDRESS}.
          Postlane is the transactional email service at <a href="https://www.postlane.email">https://www.postlane.email</a>.
          This notice covers that service only. Other TMD SPACE products have their own notices.
        </p>
        <p>
          Privacy, legal, billing, and abuse questions go to <Mail /> or {PHONE}. You can also use the <Link to="/contact">contact form</Link>.
          Do not send passwords, API keys, or full private message bodies unless we ask for a specific header or identifier to investigate a problem.
        </p>
      </section>
      <section id="scope">
        <h2>2. What this covers</h2>
        <p>
          This notice applies when you visit the site, create an account, pay for a plan, connect a sending domain, call the API, or write to us.
          It also describes personal data inside the emails you ask us to send, such as a recipient address or a name in a template.
        </p>
        <p>
          Postlane sends mail your application requests. It is not a mailbox, webmail inbox, or marketing-broadcast product. We do not read your product’s database, and we do not sell personal data.
        </p>
      </section>
      <section id="roles">
        <h2>3. Controller and processor</h2>
        <p>
          We decide why and how we process account, billing, security, and support data. For that data we are the data controller under Thailand’s Personal Data Protection Act B.E. 2562 (PDPA).
        </p>
        <p>
          You decide the content, recipients, and purpose of the messages you send. For recipient data and message content that you submit to the API, you are the controller and we are the processor.
          We handle that data to provide the service, under the <Link to="/terms">Terms of Service</Link> and your API requests. You must have a lawful basis to email each recipient.
        </p>
      </section>
      <section id="collect">
        <h2>4. Information we collect</h2>
        <h3>Account</h3>
        <ul>
          <li>Name, email address, and account status.</li>
          <li>A password hash and salt if you choose a password. We do not store the password itself.</li>
          <li>If you continue with Google, your name, email address, and Google account identifier. The scopes we request are openid, email, and profile. We do not receive your Google password.</li>
          <li>A session record: a hash of the session token, the kind of session, the user agent string, and the expiry time. The session cookie lasts 14 days.</li>
        </ul>
        <h3>Workspace</h3>
        <ul>
          <li>Workspace name, address slug, recovery email, contact email, and timezone.</li>
          <li>Team memberships, roles, and invitations, including the invited email address.</li>
          <li>API key name, scope, a hash of the secret, and a short prefix and tail so you can recognise the key. The full secret is shown once and is not stored in readable form.</li>
          <li>Sending domains, verification status, and the DNS token we issue for that domain.</li>
          <li>Saved templates: name, subject, HTML, and text.</li>
          <li>Suppression entries: the recipient address, the reason, and whether it was added from the dashboard or from a delivery event.</li>
          <li>Webhook URLs you configure.</li>
        </ul>
        <h3>Messages you send</h3>
        <p>
          For each API request we store the workspace, idempotency key, status, from address, recipient addresses, subject, HTML body, text body, provider message id, a short error description when a send fails, the time, and how many recipients counted toward your quota.
          Delivery events such as queued, delivered, deferred, bounced, failed, or complained are stored with a short detail.
        </p>
        <h3>Cloudflare authorization</h3>
        <p>
          If you authorize Cloudflare so we can add the DNS records you approve, we store the tokens required for that connection on the workspace. A short-lived cookie carries the authorization attempt. The browser window may also write a local result so the dashboard can tell whether authorization finished. That result is the domain name and whether it succeeded, not message content.
        </p>
        <h3>Billing</h3>
        <p>
          Launch and Scale are billed by Stripe. We store the plan, subscription status, and Stripe customer and subscription identifiers. Stripe collects the payment method, billing country, and tax details. We do not store card numbers.
        </p>
        <h3>Support and operations</h3>
        <p>
          The contact form collects your name, email address, and message, and delivers that message to {EMAIL}. We also keep security logs needed to run the service, including request identifiers and error details. We do not run a third-party advertising or analytics product on this site, and we do not drop marketing cookies.
        </p>
      </section>
      <section id="use">
        <h2>5. How we use it</h2>
        <ul>
          <li>Create and secure your account, workspace, and sessions.</li>
          <li>Verify domains, send the messages you request, record delivery events, and enforce suppressions.</li>
          <li>Apply plan limits, bill subscriptions, and show usage.</li>
          <li>Detect abuse, bounces, spam complaints, and compromised keys, and pause sending when a workspace is harming delivery.</li>
          <li>Answer support and legal requests, and keep records we are required to keep.</li>
          <li>Operate, debug, and protect the service.</li>
        </ul>
        <p>We do not use message content to train public models, and we do not sell or rent personal data.</p>
      </section>
      <section id="bases">
        <h2>6. Why we may process it</h2>
        <p>Depending on the activity, we rely on one or more of these grounds:</p>
        <ul>
          <li><strong>Contract.</strong> Processing needed to provide the account, API, and paid plan you asked for.</li>
          <li><strong>Legal duty.</strong> Tax, accounting, and lawful requests from authorities.</li>
          <li><strong>Legitimate interests.</strong> Securing the service, preventing abuse, keeping delivery records, and improving reliability, where those interests are not overridden by your rights.</li>
          <li><strong>Consent.</strong> Where a law requires consent, such as an optional sign-in with Google that you start yourself. You can withdraw consent by stopping that method. Withdrawal does not undo processing that already happened lawfully.</li>
        </ul>
      </section>
      <section id="share">
        <h2>7. Who receives it</h2>
        <p>We share personal data with the providers that run the service, and with recipients you address. We do not sell it.</p>
        <div className="pl-legal-tablewrap">
          <table>
            <thead>
              <tr><th>Provider</th><th>Role</th><th>Data involved</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Cloudflare, Inc.</td>
                <td>Hosts the application, database, and email delivery. May also apply DNS records you authorize.</td>
                <td>Account and workspace data, message content, domains, delivery events, and the tokens needed for an authorized DNS change.</td>
              </tr>
              <tr>
                <td>Stripe, Inc.</td>
                <td>Subscriptions, invoices, and the billing portal.</td>
                <td>Account email, workspace identifier, plan, and payment details Stripe collects directly.</td>
              </tr>
              <tr>
                <td>Google LLC</td>
                <td>Optional sign-in.</td>
                <td>Name, email address, and Google account identifier, only if you choose Google.</td>
              </tr>
              <tr>
                <td>Recipient mail servers</td>
                <td>Deliver the message you requested.</td>
                <td>The from address, recipient addresses, subject, and body of that message.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          We may also disclose information if the law requires it, to protect customers and the service from fraud or abuse, or as part of a merger or sale of the business that operates Postlane. A buyer would have to honour this notice for the data it receives.
        </p>
        <p>People you invite to a workspace can see workspace activity that their role allows, including domains, templates, and recent sends.</p>
      </section>
      <section id="transfers">
        <h2>8. International transfers</h2>
        <p>
          TMD SPACE is established in Thailand. Cloudflare, Stripe, and Google process data in the countries where they operate, which can include the United States and other countries outside Thailand and outside the country where you or your recipients live.
          We use providers that offer contractual and technical safeguards appropriate to the service. Where the PDPA or another law requires a specific transfer mechanism, we use that mechanism.
        </p>
      </section>
      <section id="retention">
        <h2>9. How long we keep it</h2>
        <ul>
          <li><strong>Activity you can see.</strong> The dashboard and the email list API show sends from the plan window: 7 days on Sandbox, and 30 days on Launch and Scale. Older rows drop off that view.</li>
          <li><strong>Stored message content.</strong> Subject, body, and recipient addresses are not deleted automatically when they leave the activity window. They remain while the workspace exists so we can operate sending, investigate abuse, and answer support questions.</li>
          <li><strong>Account and workspace data.</strong> Kept while the account is open.</li>
          <li><strong>Billing records.</strong> Kept for as long as Thai tax and accounting rules require, even after the subscription ends.</li>
          <li><strong>Security and abuse records.</strong> Kept for as long as needed to investigate, block, or defend a claim.</li>
          <li><strong>Contact messages.</strong> Kept until the enquiry is finished and any follow-up period we need has passed.</li>
          <li><strong>Sessions and sign-in cookies.</strong> The session cookie expires after 14 days. Google and Cloudflare authorization cookies expire after about 10 minutes.</li>
        </ul>
        <p>
          You can ask us to delete a workspace’s message content or close an account. We will delete or anonymize what we hold, except records we must keep for billing, abuse prevention, or a legal duty. There is no self-serve delete button yet, so send the request from the account email to <Mail />.
        </p>
      </section>
      <section id="security">
        <h2>10. Security</h2>
        <p>
          Passwords and API secrets are stored as hashes. Session cookies are HTTP-only, restricted to this site, and marked secure on HTTPS. Workspaces are separated in the application. Access to production systems is limited to people operating the service.
        </p>
        <p>
          No method of transmission or storage is perfectly secure. This page is not a security certification or a penetration-test report. If you believe an account or key is compromised, revoke the key in the dashboard and write to <Mail />.
        </p>
      </section>
      <section id="rights">
        <h2>11. Your rights</h2>
        <p>
          Under the PDPA, and under other privacy laws when they apply to you, you may ask to access, correct, delete, restrict, or object to processing of your personal data, ask for a portable copy where the law provides that right, and withdraw consent where processing is based on consent.
          You may also complain to the Personal Data Protection Committee of Thailand, or to the supervisory authority where you live.
        </p>
        <p>
          Send requests to <Mail /> from the email on the account, or with enough detail for us to verify that the request is yours. We may ask for confirmation before we act. If you are asking about a message someone else sent through Postlane, contact that sender first. They control the content and the reason it was sent.
        </p>
        <p>
          If you are a recipient and do not want further mail from a customer, use the sender’s unsubscribe or reply path where the message has one. You may also write to <Mail /> with the from address and the time of the message. We can suppress further sends from that workspace when the report is valid. We do not control mail that a customer sends through a different provider.
        </p>
      </section>
      <section id="cookies">
        <h2>12. Cookies</h2>
        <p>We use cookies that are required to sign you in and to finish a connection you start. We do not use advertising or analytics cookies.</p>
        <div className="pl-legal-tablewrap">
          <table>
            <thead>
              <tr><th>Cookie</th><th>Purpose</th><th>Lifetime</th></tr>
            </thead>
            <tbody>
              <tr><td>postlane_session</td><td>Keeps you signed in. HTTP-only.</td><td>14 days</td></tr>
              <tr><td>postlane_oauth</td><td>Completes Google sign-in.</td><td>About 10 minutes</td></tr>
              <tr><td>postlane_cf_oauth</td><td>Completes a Cloudflare DNS authorization you start.</td><td>About 10 minutes</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section id="children">
        <h2>13. Children</h2>
        <p>
          Postlane is a business service. It is not directed at children under 16, and we do not knowingly create accounts for them. If you believe a child has given us personal data, write to <Mail /> and we will delete the account when we confirm it.
        </p>
      </section>
      <section id="changes">
        <h2>14. Changes</h2>
        <p>
          We will post changes on this page and update the effective date. If a change materially reduces your rights, we will also give notice in the dashboard or by email to the account address before the change applies, where that is practical.
        </p>
      </section>
      <section id="contact">
        <h2>15. How to reach us</h2>
        <p>
          {COMPANY}<br />
          {ADDRESS}<br />
          <Mail /><br />
          {PHONE}<br />
          <Link to="/contact">Contact form</Link>
        </p>
      </section>
    </div>
  );
}

function TermsBody() {
  return (
    <div className="pl-legal-body">
      <section id="agreement">
        <h2>1. The agreement</h2>
        <p>
          These Terms of Service are a contract between you and {COMPANY}, {ADDRESS} (“TMD SPACE”, “we”). They govern access to Postlane at <a href="https://www.postlane.email">https://www.postlane.email</a>, including the website, dashboard, API, and paid plans.
        </p>
        <p>
          By creating an account, signing in, calling the API, or paying for a plan, you agree to these terms and the <Link to="/privacy">Privacy Policy</Link>. If you use Postlane for a company, you confirm that you can bind that company, and “you” means that company.
        </p>
        <p>
          If you do not agree, do not use the service. These terms do not change rights that a mandatory consumer law gives you and does not allow to be waived.
        </p>
      </section>
      <section id="service">
        <h2>2. The service</h2>
        <p>
          Postlane is a transactional email API. You verify a domain you control, create an API key, and send messages such as welcome notes, email verification, password resets, receipts, and similar messages that a person expects because of something they did in your product.
        </p>
        <p>The service includes:</p>
        <ul>
          <li>Domain verification and the DNS records we show for sending.</li>
          <li>Scoped API keys and the send API at <code>POST /v1/emails</code> on this site.</li>
          <li>Templates, suppression lists, delivery activity, and webhook URLs you configure.</li>
          <li>Sandbox, Launch, and Scale plans described on the <Link to="/pricing">pricing page</Link>.</li>
        </ul>
        <p>
          Postlane is not an inbox, IMAP mailbox, or bulk marketing platform. A queued or accepted response means our sending provider accepted the request. It does not mean the message reached an inbox. Inbox placement depends on the recipient server, your content, and your domain reputation.
        </p>
        <p>
          Outbound mail is sent through Cloudflare Email Sending. Cloudflare’s own terms and sending rules also apply to messages we submit for you. We may change providers if we give you reasonable notice, or immediately if the current provider stops the service.
        </p>
      </section>
      <section id="accounts">
        <h2>3. Accounts and teams</h2>
        <p>
          You must give a name and an email address you can access. Passwords must be at least 12 characters. You must verify the address before you add a sending domain. You can also sign in with Google.
        </p>
        <p>
          You are responsible for the activity under your account, API keys, and workspace, including activity by people you invite. Keep keys on your server. Do not put them in a public repository, a browser app, or a mobile app. Revoke a key you no longer trust.
        </p>
        <p>
          The workspace owner is responsible for members and for removing access when someone leaves. Invitations are tied to the invited email address. Scale includes team roles. Sandbox and Launch do not.
        </p>
        <p>
          We may refuse, reclaim, or rename a workspace slug that infringes someone’s rights, impersonates another party, or is needed to operate the service.
        </p>
      </section>
      <section id="content">
        <h2>4. Content and domains</h2>
        <p>
          You keep ownership of the templates and message content you submit. You give us a limited licence to host, transmit, and store that content only to provide, secure, and support the service, and to meet law.
        </p>
        <p>You confirm that:</p>
        <ul>
          <li>You control each sending domain, or the domain owner has authorized you to send from it.</li>
          <li>The from address does not misrepresent who the mail is from.</li>
          <li>You have a lawful basis to use the recipient data in the message, including names and addresses you place in templates.</li>
          <li>The content does not infringe someone else’s rights and does not contain malware.</li>
        </ul>
        <p>
          DNS records we publish, including ownership, SPF, DKIM, and bounce routing, must be added at the DNS host for that domain before sending works. If you authorize Cloudflare, you allow us to create the records shown for that domain. You can withdraw that authorization by disconnecting the integration or writing to <Mail />.
        </p>
      </section>
      <section id="use">
        <h2>5. Acceptable use</h2>
        <p>You may use Postlane for legitimate transactional mail. You may not use it to:</p>
        <ul>
          <li>Send unsolicited bulk mail, purchased lists, or marketing campaigns.</li>
          <li>Send phishing, malware, scams, or content that is unlawful.</li>
          <li>Impersonate a person, brand, or domain you do not represent.</li>
          <li>Hide the real sender, forge headers, or evade suppressions, rate limits, or a sending hold.</li>
          <li>Probe, scan, or disrupt the service or another customer’s workspace.</li>
          <li>Send to people who have opted out, complained, or hard-bounced, once you know or should know.</li>
        </ul>
        <p>
          Keep complaint and bounce rates low. If they rise, investigate before you increase volume. We may suppress an address, pause sending on a workspace, or close an account that threatens delivery for other customers. The <Link to="/acceptable-use">acceptable use page</Link> states the same rules in shorter form. These terms control if the two differ.
        </p>
        <p>
          Report misuse to <Mail /> with the sender address, the approximate time and time zone, and the relevant headers. Do not include passwords or API keys.
        </p>
      </section>
      <section id="fees">
        <h2>6. Plans, fees, and taxes</h2>
        <p>Prices are in US dollars and exclude tax. Current workspace prices are:</p>
        <div className="pl-legal-tablewrap">
          <table>
            <thead>
              <tr><th>Plan</th><th>Price</th><th>Sending domains</th><th>Daily cap</th><th>Monthly cap</th><th>History shown</th></tr>
            </thead>
            <tbody>
              <tr><td>Sandbox</td><td>USD 0</td><td>3</td><td>100</td><td>1,000</td><td>7 days</td></tr>
              <tr><td>Launch</td><td>USD 20 per month</td><td>10</td><td>1,500</td><td>40,000</td><td>30 days</td></tr>
              <tr><td>Scale</td><td>USD 60 per month</td><td>30</td><td>4,000</td><td>100,000</td><td>30 days</td></tr>
            </tbody>
          </table>
        </div>
        <ul>
          <li>Each To, Cc, and Bcc address counts as one email toward the cap.</li>
          <li>Daily caps reset at 00:00 UTC.</li>
          <li>Launch includes 10 API keys and 5 webhooks. Scale includes 25 API keys, 10 webhooks, and team roles. Sandbox includes 2 API keys and 1 webhook. API rate limits are 5, 10, and 25 requests per second for Sandbox, Launch, and Scale.</li>
          <li>A message may include at most 50 recipients and 5 MiB of subject plus body. There is no attachment field.</li>
          <li>Paid limits apply only after Stripe reports the subscription as active. Until then, Sandbox limits apply.</li>
        </ul>
        <p>
          Launch and Scale renew monthly until you cancel. Checkout and card handling are provided by Stripe. Changing between Launch and Scale is prorated by Stripe. If a payment fails or the subscription is not active, the workspace returns to Sandbox limits.
        </p>
        <p>
          You can cancel in the Stripe billing portal linked from Usage &amp; billing. Cancellation takes effect at the end of the current paid period. The paid limits continue until that time. We do not refund the current period, except where the law requires a refund. Fees already incurred stay payable.
        </p>
        <p>
          Taxes, including VAT or similar charges, may be added by Stripe based on your billing location. You are responsible for taxes on your side of the transaction other than taxes on our income. We may change prices by posting the new price and applying it on the next renewal. The price in effect at the start of a period applies to that period.
        </p>
      </section>
      <section id="delivery">
        <h2>7. Limits and delivery</h2>
        <p>
          Sends require an idempotency key. Reusing the same key for the same logical send returns the original result and does not send a second message. Use a new key only when you intend a new message.
        </p>
        <p>
          We may reject a request that is over a plan cap, over the message size, sent from an unverified domain, sent to a suppressed address, or blocked by a sending hold. Cloudflare can also reject a send when its own account quota is reached, even if your workspace is still under its plan cap.
        </p>
        <p>
          We do not promise a monthly uptime percentage, a delivery-time target, or inbox placement. The status page describes the service when monitoring is connected. Maintenance, provider outages, and recipient-server delays can interrupt sending.
        </p>
        <p>
          Webhook endpoints you configure receive the events we can deliver. You should treat events as possibly delayed or repeated. There is no signed webhook stream beyond what the dashboard currently offers, and a manual test ping is not proof of production delivery.
        </p>
      </section>
      <section id="processing">
        <h2>8. Privacy and processing</h2>
        <p>
          The <Link to="/privacy">Privacy Policy</Link> explains account data we control. This section is the processing instruction for personal data you submit so we can send mail.
        </p>
        <ul>
          <li>You are the controller of recipient and message data. We are the processor.</li>
          <li>We process that data only to send, record, suppress, secure, and support the messages you request, and to meet law.</li>
          <li>The categories are identification and contact data in the message, and the content of the message itself. Recipients are the people you address.</li>
          <li>People who operate Postlane access message content only when needed for support, security, or abuse review.</li>
          <li>Subprocessors are Cloudflare for hosting and delivery, and Stripe for billing data that is separate from message content. Google receives account data only if you choose Google sign-in.</li>
          <li>We will tell you if a law forces us to process that data for another reason, unless the law forbids the notice.</li>
          <li>You may request deletion of message content as described in the Privacy Policy. On closure of the workspace we delete or anonymize that content unless a legal duty requires us to keep it.</li>
          <li>If we learn of a personal-data incident affecting message content we process for you, we will tell you without undue delay, with what we know about the nature of the incident and the steps we are taking.</li>
        </ul>
        <p>
          You will not instruct us to process special-category data, payment card numbers, government identifiers, or other highly sensitive data unless you have a lawful basis and you accept that the service is not designed as a vault for that data. Do not place secrets you cannot afford to store in a subject line or body.
        </p>
      </section>
      <section id="suspension">
        <h2>9. Suspension and ending the service</h2>
        <p>You may stop using Postlane at any time and cancel a paid plan as described above.</p>
        <p>We may suspend sending or close a workspace if:</p>
        <ul>
          <li>You break these terms or the acceptable-use rules, or your mail is generating elevated bounces or spam complaints.</li>
          <li>Your payment is overdue, after Stripe marks the subscription inactive.</li>
          <li>We must do so to comply with law, a provider requirement, or a security incident.</li>
        </ul>
        <p>
          Where we can do so without adding risk, we will email the account address and tell you what happened. A sending hold stays in place until we review the workspace. Write to <Mail /> to ask for that review. We may refuse to restore sending that we reasonably believe is abusive.
        </p>
        <p>
          While the account is open, recent activity is available in the dashboard and API for the plan’s history window. Ask <Mail /> if you need a copy of account data we still hold. After closure, we handle deletion as the Privacy Policy describes.
        </p>
      </section>
      <section id="ip">
        <h2>10. Intellectual property</h2>
        <p>
          We own Postlane, including the site, dashboard, API design, and brand. We grant you a limited, non-exclusive, non-transferable right to use the service while these terms are in force and your account is in good standing. You may not copy the service, resell it as a competing email API, or remove our notices, except that your own product may send mail through the API for your users.
        </p>
        <p>
          Feedback you choose to give may be used to operate and improve Postlane without any obligation to you. Do not send us ideas you consider confidential.
        </p>
      </section>
      <section id="liability">
        <h2>11. Warranties and liability</h2>
        <p>
          The service is provided as available. To the extent the law allows, we disclaim implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant uninterrupted operation, error-free software, or that a message will be delivered or placed in an inbox.
        </p>
        <p>
          To the extent the law allows, neither party is liable for lost profits, lost goodwill, lost data, or indirect or consequential damages, even if advised they were possible. Our total liability arising out of the service in any 12-month period is limited to the fees you paid us for Postlane in that period. If you use only Sandbox, that cap is USD 100.
        </p>
        <p>
          These limits do not apply to liability that cannot legally be limited, including fraud, or to your obligation to pay fees and to indemnify us for claims about your content and your sending.
        </p>
        <p>
          You will defend and indemnify TMD SPACE and its staff against third-party claims, damages, and reasonable legal costs arising from your message content, your recipient data, your domains, or your breach of these terms, except to the extent the claim is caused by our breach of this agreement.
        </p>
      </section>
      <section id="law">
        <h2>12. Law, changes, and notices</h2>
        <p>
          These terms are governed by the laws of Thailand, without regard to conflict-of-law rules. The courts of Bangkok have exclusive jurisdiction, except that you may also bring a claim in your local courts where a consumer law does not allow this clause to prevent it. The English text of these terms is the controlling version.
        </p>
        <p>
          If a provision is unenforceable, the rest remains in effect. A delay in enforcing a right is not a waiver. You may not assign this agreement without our consent, except to a successor of your whole business. We may assign it to an affiliate or to a buyer of the Postlane business.
        </p>
        <p>
          We are not liable for a failure caused by events outside our reasonable control, including provider outages, denial-of-service attacks, and failures of public networks. These terms, the Privacy Policy, and the plan you purchase are the whole agreement for Postlane. They replace earlier discussions about the same subject.
        </p>
        <p>
          We may update these terms by posting a new version on this page with a new effective date. Material changes apply to a paid plan at the next renewal, unless a law or a security risk requires an earlier change. Continued use after the effective date is acceptance of the update. If you do not agree, cancel before the renewal.
        </p>
        <p>
          Notices to you may be sent to the email on the account or shown in the dashboard. Notices to us must be sent to <Mail /> or by post to {COMPANY}, {ADDRESS}. A notice by email is received on the day it is sent if no bounce is returned.
        </p>
        <p>
          {COMPANY}<br />
          {ADDRESS}<br />
          <Mail /><br />
          {PHONE}
        </p>
      </section>
    </div>
  );
}
