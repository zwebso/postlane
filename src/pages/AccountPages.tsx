import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { PLAN_CATALOG, normalizePlan } from "../../shared/domain";
import type { SetupSnapshot } from "../types";
import { Banner, Modal, PageHead, TextField } from "../ui";

export function BillingPage({ setup, toast }: { setup: SetupSnapshot | null; toast: (m: string) => void }) {
  const { workspace: slug } = useParams();
  const [info, setInfo] = useState<{ message: string; subscription: Record<string, string | number> | null } | null>(null);
  useEffect(() => {
    if (slug && slug !== "new") api.billing(slug).then(setInfo);
  }, [slug]);
  const plan = normalizePlan(String(info?.subscription?.plan ?? setup?.subscription?.plan ?? "sandbox"));
  const spec = PLAN_CATALOG[plan];
  const isFree = plan === "sandbox";
  return (
    <>
      <PageHead title="Billing" subtitle="Your subscription, payment method, and invoices." />
      <Banner tone="info">{info?.message || setup?.pricingNote}</Banner>
      <div className="two-col">
        <div className="card pad">
          <h2>{spec.label} plan</h2>
          <div className="plan-price">
            ${spec.priceCents / 100}
            <span className="sub">{isFree ? " / month · no card required" : " / workspace / month"}</span>
          </div>
          <p className="sub">
            {isFree
              ? "Sandbox includes sending limits without a card. Activation still depends on domain ownership and delivery checks."
              : "Paid limits apply after Stripe confirms the subscription."}
          </p>
        </div>
        <div className="card pad">
          <h2>Payment method</h2>
          <p className="sub">Payment method, invoices, and cancellation open in Stripe.</p>
          <button onClick={async () => {
            if (!slug || slug === "new") return toast("Open a workspace before managing billing.");
            try {
              const portal = await api.billingPortal(slug);
              if (portal.url) window.location.href = portal.url;
            } catch (err) {
              toast(err instanceof Error ? err.message : "Stripe billing is not available yet.");
            }
          }}>Update payment method</button>
        </div>
      </div>
      <details>
        <summary>Cancel subscription</summary>
        <p>Show the effective cancellation date, export options, and retention deadline from the real commercial policy before confirmation. Those dates are not invented here.</p>
      </details>
    </>
  );
}

export function TeamPage({ toast }: { toast: (m: string) => void }) {
  const { workspace: slug } = useParams();
  const [data, setData] = useState<{ members: Array<Record<string, string>>; invitations: Array<Record<string, string>>; note: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  useEffect(() => {
    if (slug && slug !== "new") api.team(slug).then(setData);
  }, [slug]);
  return (
    <>
      <PageHead title="Team" subtitle="Control who can manage your workspace." action={<button className="primary" onClick={() => setOpen(true)}>Invite teammate</button>} />
      <Banner tone="info">{data?.note}</Banner>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {data?.members.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.name}
                  <div className="row-note">{m.email}</div>
                </td>
                <td>{m.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? (
        <Modal title="Invite a teammate" onClose={() => setOpen(false)}>
          <TextField label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="field">
            <label htmlFor="role">Workspace role</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="billing">Billing</option>
              <option value="member">Member</option>
            </select>
          </div>
          <button
            className="primary"
            onClick={async () => {
              const res = await api.invite(slug!, { email, role });
              toast(res.message + (res.mock && res.url ? ` ${res.url}` : ""));
              setOpen(false);
              setData(await api.team(slug!));
            }}
          >
            Create invitation
          </button>
        </Modal>
      ) : null}
    </>
  );
}

export function SecurityPage({ toast }: { toast: (m: string) => void }) {
  const [sessions, setSessions] = useState<Array<Record<string, string>>>([]);
  const [mfa, setMfa] = useState("");
  useEffect(() => {
    api.security().then((r) => {
      setSessions(r.sessions);
      setMfa(r.mfa.message);
    });
  }, []);
  return (
    <>
      <PageHead title="Security" subtitle="Protect your account and workspace." />
      <div className="two-col">
        <div className="card pad">
          <h2>Sign-in protection</h2>
          <div className="toggle-row">
            <div>
              <strong>Two-factor authentication</strong>
              <p>{mfa}</p>
            </div>
            <button onClick={() => toast(mfa)}>Set up</button>
          </div>
          <div className="toggle-row">
            <div>
              <strong>Password</strong>
              <p>Change from the reset flow after recent authentication.</p>
            </div>
            <Link to="/forgot-password">Change</Link>
          </div>
        </div>
        <div className="card pad">
          <h2>Active sessions</h2>
          {sessions.map((s) => (
            <div className="toggle-row" key={s.id}>
              <div>
                <strong>{s.user_agent || "Unknown browser"}</strong>
                <p>Started {new Date(s.created_at).toLocaleString()}</p>
              </div>
              <button
                onClick={async () => {
                  await api.revokeSession(s.id);
                  setSessions((prev) => prev.filter((x) => x.id !== s.id));
                  toast("Session revoked.");
                }}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function SettingsPage({ setup, toast }: { setup: SetupSnapshot | null; toast: (m: string) => void }) {
  const { workspace: slug } = useParams();
  const [name, setName] = useState(setup?.workspace?.name ?? "");
  const [contact, setContact] = useState(setup?.workspace?.contact_email ?? "");
  const [timezone, setTimezone] = useState(setup?.workspace?.timezone ?? "UTC");
  return (
    <>
      <PageHead title="Workspace settings" subtitle="The details that make this workspace yours." />
      <div className="card pad">
        <div className="form-narrow">
          <TextField label="Workspace name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Contact email" type="email" value={contact} onChange={(e) => setContact(e.target.value)} />
          <div className="field">
            <label htmlFor="zone">Time zone</label>
            <select id="zone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <option>UTC</option>
              <option>Asia/Bangkok</option>
              <option>America/New_York</option>
              <option>Europe/London</option>
            </select>
          </div>
          <button
            className="primary"
            onClick={async () => {
              await api.patchWorkspace(slug!, { name, contactEmail: contact, timezone });
              toast("Workspace preferences saved.");
            }}
          >
            Save changes
          </button>
        </div>
      </div>
    </>
  );
}

export function NotificationsPage() {
  const { workspace: slug } = useParams();
  const [rows, setRows] = useState<Array<Record<string, string | number>>>([]);
  useEffect(() => {
    if (slug && slug !== "new") api.notifications(slug).then((r) => setRows(r.notifications));
  }, [slug]);
  return (
    <>
      <PageHead
        title="Notifications"
        subtitle="Updates that help you keep your email running."
        action={
          <button
            onClick={async () => {
              await api.readNotifications(slug!);
              const latest = await api.notifications(slug!);
              setRows(latest.notifications);
            }}
          >
            Mark all as read
          </button>
        }
      />
      <div className="card pad">
        {rows.map((n) => (
          <div className="activity" key={String(n.id)}>
            <div>
              <p>
                <strong>{n.title}</strong>
              </p>
              <p className="sub">{String(n.body)}</p>
              <small>{String(n.created_at)}</small>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function ActivityPage() {
  const { workspace: slug } = useParams();
  const [events, setEvents] = useState<Array<Record<string, string>>>([]);
  useEffect(() => {
    if (slug && slug !== "new") api.activity(slug).then((r) => setEvents(r.events));
  }, [slug]);
  return (
    <>
      <PageHead title="Activity" subtitle="A clear history of changes and delivery events." />
      <div className="card pad">
        {events.map((e) => (
          <div className="activity" key={e.id}>
            <div>
              <p>
                <strong>{e.event}</strong>
              </p>
              <p className="sub">
                {e.resource} · {e.result}
              </p>
              <small>
                {e.created_at} · {e.correlation_id}
              </small>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function SupportPage({ toast }: { toast: (m: string) => void }) {
  const { workspace } = useParams();
  const [subject, setSubject] = useState("Domain setup help");
  const [body, setBody] = useState("");
  return (
    <>
      <PageHead title="How can we help?" subtitle="Find an answer or send a support request." />
      <div className="two-col">
        <div className="card pad">
          <h2>Common questions</h2>
          {[
            ["My DNS records are not detected", "Confirm you are editing the authoritative DNS provider. Compare the name and value, then wait for caches to update."],
            ["I can receive but cannot send", "Check SMTP authentication, TLS settings, mailbox suspension, quota, and sender authentication."],
            ["I’m moving from another provider", "Keep the old service active, import messages, then change MX after all destination addresses exist."],
            ["My messages land in spam", "Correct authentication is necessary but does not guarantee inbox placement."],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
        <div className="card pad">
          <h2>Contact support</h2>
          <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <div className="field">
            <label htmlFor="issue">What happened?</label>
            <textarea id="issue" value={body} onChange={(e) => setBody(e.target.value)} />
            <small>Do not include passwords, recovery codes, or private message content.</small>
          </div>
          <button
            className="primary"
            onClick={async () => {
              if (!workspace || workspace === "new") return toast("Create a workspace first.");
              const res = await api.support(workspace, { subject, body });
              toast(`Ticket ${res.ticketId} saved. No email was sent.`);
            }}
          >
            Create ticket
          </button>
        </div>
      </div>
    </>
  );
}

export function WebmailPage({ setup, toast }: { setup: SetupSnapshot | null; toast: (m: string) => void }) {
  const { workspace: slug } = useParams();
  const mailbox = setup?.mailboxes[0];
  const [messages, setMessages] = useState<
    Array<{ id: string; direction: string; from_address: string | null; to_address: string; subject: string | null; created_at: string }>
  >([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [compose, setCompose] = useState({ to: "", subject: "", text: "" });
  const [note, setNote] = useState("SendEmail is text-only. Attachments are not available on send.");
  useEffect(() => {
    if (!slug || slug === "new" || slug === "demo" || !mailbox) return;
    api.mailboxMessages(slug, mailbox.id).then((res) => {
      setMessages(res.messages);
      setNote(res.compose.note);
      setSelected(res.messages[0]?.id ?? null);
    });
  }, [slug, mailbox?.id]);
  const current = messages.find((m) => m.id === selected);
  return (
    <>
      <PageHead title="Inbox" subtitle={mailbox?.address_normalized ?? "No mailbox yet"} />
      {mailbox?.status !== "active" ? (
        <Banner tone="info">This is a Postlane preview inbox. A mailbox stays inactive until every server gate passes.</Banner>
      ) : null}
      <div className="card inbox">
        <div className="message-list">
          {messages.length ? (
            messages.map((item) => (
              <button
                key={item.id}
                className={`message-item${item.id === selected ? " selected" : ""}`}
                onClick={() => setSelected(item.id)}
              >
                <strong>{item.from_address || item.to_address}</strong>
                <p>{item.subject || "(no subject)"}</p>
                <small>
                  {item.direction} · {item.created_at}
                </small>
              </button>
            ))
          ) : (
            <button className="message-item selected">
              <strong>No messages yet</strong>
              <p>Inbound mail is stored here after the catch-all Worker receives it.</p>
              <small>Sample preview only when no mailbox is connected.</small>
            </button>
          )}
        </div>
        <article className="message-body">
          <div className="eyebrow">{current?.direction ?? "Preview"}</div>
          <h2>{current?.subject ?? "Your inbox is empty."}</h2>
          <p className="sub">{current ? `${current.from_address ?? "unknown"} → ${current.to_address}` : note}</p>
          {mailbox?.status === "active" && slug ? (
            <form
              className="form-narrow"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const res = await api.composeMessage(slug, mailbox.id, compose);
                  toast(res.message);
                  setCompose({ to: "", subject: "", text: "" });
                  const next = await api.mailboxMessages(slug, mailbox.id);
                  setMessages(next.messages);
                } catch (caught) {
                  toast((caught as Error).message);
                }
              }}
            >
              <TextField label="To" type="email" value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} />
              <TextField label="Subject" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} />
              <div className="field">
                <label htmlFor="compose-body">Message</label>
                <textarea id="compose-body" value={compose.text} onChange={(e) => setCompose({ ...compose, text: e.target.value })} />
                <small>Attachments cannot be sent in this phase.</small>
              </div>
              <button className="primary">Send text message</button>
            </form>
          ) : (
            <p>Vendor-hosted webmail and IMAP stay unavailable until a mailbox vendor is licensed.</p>
          )}
        </article>
      </div>
    </>
  );
}

export function OpsPage() {
  const [data, setData] = useState<{ jobs: Array<Record<string, string>> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .staffLogin()
      .then(() => api.ops())
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);
  return (
    <>
      <PageHead title="Service operations" subtitle="Staff-only console. Separate authentication boundary." />
      <Banner tone="info">Least-privilege staff roles are required. Message content is not exposed here.</Banner>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Status</th>
              <th>Correlation</th>
            </tr>
          </thead>
          <tbody>
            {data?.jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <Link to={`/ops/jobs/${job.id}`}>{job.type}</Link>
                </td>
                <td>{job.status}</td>
                <td>{job.correlation_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ScreenLibraryPage() {
  const groups = [
    ["01 / Access", ["/signup", "/verify-email", "/login", "/forgot-password", "/reset-password"]],
    ["02 / Activation", ["/w/demo/setup/workspace", "/w/demo/domains", "/w/demo/migrations"]],
    ["03 / Daily workspace", ["/w/demo/overview", "/w/demo/mailboxes", "/w/demo/aliases", "/w/demo/webmail"]],
    ["04 / Account", ["/w/demo/billing", "/w/demo/team", "/account/security", "/w/demo/settings"]],
    ["05 / Assistance", ["/w/demo/notifications", "/w/demo/activity", "/support"]],
    ["06 / Operations", ["/ops"]],
  ] as const;
  return (
    <>
      <PageHead title="The complete experience" subtitle="Development screen index. Remove this route from production builds." />
      <div className="atlas-grid">
        {groups.map(([title, links]) => (
          <section className="card atlas-item" key={title}>
            <div className="eyebrow">{title}</div>
            <ul>
              {links.map((href) => (
                <li key={href}>
                  <Link to={href}>{href}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
