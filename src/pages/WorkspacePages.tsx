import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { formatQuota, mailboxQuotaMb } from "../../shared/domain";
import type { SessionUser, SetupSnapshot } from "../types";
import { Banner, Empty, Modal, PageHead, RecordCard, TextField } from "../ui";

export function OverviewPage({ user, setup }: { user: SessionUser; setup: SetupSnapshot | null }) {
  const { workspace: slug } = useParams();
  const live = Boolean(setup?.activationAllowed);
  const complete = setup?.gates.filter((g) => g.ok).length ?? 0;
  return (
    <>
      <PageHead
        title={`Good morning, ${user.name.split(" ")[0]}`}
        subtitle="Your email workspace, at a glance."
        action={
          <Link className="primary" to={`/w/${slug}/webmail`} style={{ padding: "10px 15px", borderRadius: 8 }}>
            Open mailbox
          </Link>
        }
      />
      <section className="setup-banner">
        <div className="intro">
          <div className="eyebrow">{live ? "You’re connected" : "Let’s get your email live"}</div>
          <h2>{live ? "Your workspace is ready." : "Your domain. Your next chapter."}</h2>
          <p className="sub">
            {live
              ? "Your mailbox is active. Send, receive, and manage your team’s email from one place."
              : "Finish the remaining gates. A green DNS check alone cannot activate a mailbox."}
          </p>
          <Link className="primary" to={live ? `/w/${slug}/mailboxes` : `/w/${slug}/setup/${setup?.nextStep ?? "workspace"}`} style={{ display: "inline-flex", padding: "10px 15px" }}>
            {live ? "Manage mailboxes" : "Continue setup"}
          </Link>
        </div>
        <div className={`progress-ring ${live ? "complete" : ""}`}>
          <div>
            {Math.min(complete, 5)} / 5<small>gates complete</small>
          </div>
        </div>
        <div className="setup-footer">
          {[
            ["Workspace created", Boolean(setup?.workspace)],
            ["Domain verified", setup?.domain?.ownership_status === "verified"],
            ["Mailboxes prepared", (setup?.mailboxes.length ?? 0) > 0],
            ["Connect DNS", setup?.dns.some((row) => row.component === "mx" && row.status === "valid")],
            ["Test delivery", live],
          ].map(([label, done], i) => (
            <span key={String(label)}>
              <b className={`tiny-circle ${done ? "done" : ""}`}>{done ? "✓" : i + 1}</b>
              {label}
            </span>
          ))}
        </div>
      </section>
      <div className="stats">
        <div className="card stat">
          <div className="stat-head">Mailboxes</div>
          <div className="stat-value">
            {setup?.mailboxes.length ?? 0}
            <span style={{ fontSize: 15, color: "var(--muted)" }}> / 5</span>
          </div>
          <small>{live ? "All mailboxes active" : "Prepared · awaiting connection"}</small>
        </div>
        <div className="card stat">
          <div className="stat-head">Connected domains</div>
          <div className="stat-value">{setup?.domain ? 1 : 0}</div>
          <small>{setup?.domain ? setup.domain.name : "Add a domain to start"}</small>
        </div>
        <div className="card stat">
          <div className="stat-head">Storage used</div>
          <div className="stat-value">
            0.0 <span style={{ fontSize: 15, color: "var(--muted)" }}>GB</span>
          </div>
          <small>{setup?.provider.mock ? "Placeholder quota until a provider is configured" : setup?.provider.quotas}</small>
        </div>
      </div>
      <div className="split">
        <div className="stack">
          <section className="card">
            <div className="section-title">
              <h2>Your domains</h2>
              <Link className="text-button" to={`/w/${slug}/domains`}>
                View all
              </Link>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Status</th>
                    <th>Mailboxes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>{setup?.domain?.name ?? "No domain yet"}</strong>
                    </td>
                    <td>{setup?.domain?.ownership_status ?? "—"}</td>
                    <td>{setup?.mailboxes.length ?? 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <aside className="stack">
          <section className="card subcard">
            <h3>Your setup checklist</h3>
            <div className="checklist">
              {setup?.gates.map((gate) => (
                <div key={gate.id} className={`row ${gate.ok ? "done" : "current"}`}>
                  <span className="number">{gate.ok ? "✓" : "•"}</span>
                  {gate.label}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

export function DomainsPage({ setup }: { setup: SetupSnapshot | null }) {
  const { workspace: slug } = useParams();
  if (!setup?.domain) {
    return (
      <>
        <PageHead title="Domains" subtitle="Connect your domain and keep email delivery healthy." />
        <Empty title="Your email starts with a domain" body="Connect a domain you own to create your first business address." action={<Link className="primary" to={`/w/${slug}/setup/domain`}>Connect domain</Link>} />
      </>
    );
  }
  return (
    <>
      <PageHead title="Domains" subtitle="Connect your domain and keep email delivery healthy." action={<Link className="primary" to={`/w/${slug}/setup/domain`}>Add domain</Link>} />
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Domain</th>
              <th>Ownership</th>
              <th>Email routing</th>
              <th>Authentication</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>{setup.domain.name}</strong>
                <div className="row-note">Primary · DNS managed externally</div>
              </td>
              <td>{setup.domain.ownership_status}</td>
              <td>{setup.dns.find((d) => d.component === "mx")?.status ?? "pending"}</td>
              <td>{setup.dns.find((d) => d.component === "spf")?.status ?? "pending"}</td>
              <td>
                <Link to={`/w/${slug}/domains/${setup.domain.id}`}>Manage DNS</Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

export function DomainDetailPage({ setup, refresh, toast }: { setup: SetupSnapshot | null; refresh: () => Promise<void>; toast: (m: string) => void }) {
  const { workspace: slug } = useParams();
  return (
    <>
      <PageHead title={setup?.domain?.name ?? "Domain"} subtitle="Expected versus detected records. The server is the only authority." />
      {setup?.dns.map((row) => (
        <RecordCard
          key={row.component}
          title={row.component}
          type={row.record_type}
          host={row.host}
          value={row.expected_value}
          status={row.status || "unknown"}
          detected={row.detected_value}
          lastCheck={row.checked_at}
          nextCheck={row.next_check_at}
        />
      ))}
      <button
        className="primary"
        onClick={async () => {
          if (!setup?.domain || !slug) return;
          await api.checkDns(slug, setup.domain.id);
          await refresh();
          toast("DNS check recorded. Timeouts are not treated as invalid records.");
        }}
      >
        Recheck DNS
      </button>
    </>
  );
}

export function MailboxesPage({ setup, refresh, toast }: { setup: SetupSnapshot | null; refresh: () => Promise<void>; toast: (m: string) => void }) {
  const { workspace: slug } = useParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [localPart, setLocalPart] = useState("");
  const [displayName, setDisplayName] = useState("");
  if (!setup?.mailboxes.length) {
    return (
      <>
        <PageHead title="Mailboxes" subtitle="A dedicated inbox for everyone on your team." />
        <Empty title="Give your team a place to write" body="Create your first mailbox. You can add aliases later." action={<button className="primary" onClick={() => setOpen(true)}>Create mailbox</button>} />
        {open ? (
          <CreateMailboxDialog
            slug={slug!}
            localPart={localPart}
            displayName={displayName}
            setLocalPart={setLocalPart}
            setDisplayName={setDisplayName}
            onClose={() => setOpen(false)}
            onCreated={async () => {
              await refresh();
              setOpen(false);
              toast("Mailbox prepared. It is not live.");
            }}
          />
        ) : null}
      </>
    );
  }
  return (
    <>
      <PageHead title="Mailboxes" subtitle="Prepared is not the same as active." action={<button className="primary" onClick={() => setOpen(true)}>Create mailbox</button>} />
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mailbox</th>
              <th>Status</th>
              <th>Storage</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {setup.mailboxes.map((box) => (
              <tr key={box.id}>
                <td>
                  <strong>{box.address_normalized}</strong>
                  <div className="row-note">{box.display_name}</div>
                </td>
                <td>{box.status}</td>
                <td>
                  {mailboxQuotaMb(box) < 1000 ? "0 MB" : "0.0 GB"} / {formatQuota(mailboxQuotaMb(box))}
                  <div className="meter">
                    <span style={{ width: "2%" }} />
                  </div>
                </td>
                <td>
                  <button onClick={() => navigate(`/w/${slug}/mailboxes/${box.id}`)}>Manage</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? (
        <CreateMailboxDialog
          slug={slug!}
          localPart={localPart}
          displayName={displayName}
          setLocalPart={setLocalPart}
          setDisplayName={setDisplayName}
          onClose={() => setOpen(false)}
          onCreated={async () => {
            await refresh();
            setOpen(false);
            toast("Mailbox prepared. It is not live.");
          }}
        />
      ) : null}
    </>
  );
}

function CreateMailboxDialog(props: {
  slug: string;
  localPart: string;
  displayName: string;
  setLocalPart: (v: string) => void;
  setDisplayName: (v: string) => void;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  return (
    <Modal title="Create a mailbox" onClose={props.onClose}>
      <TextField label="Email username" value={props.localPart} onChange={(e) => props.setLocalPart(e.target.value)} />
      <TextField label="Display name" value={props.displayName} onChange={(e) => props.setDisplayName(e.target.value)} />
      <p className="sub">Production must show the prorated total before confirmation. No charge is collected here.</p>
      <button
        className="primary"
        onClick={async () => {
          await api.createMailbox(props.slug, { localPart: props.localPart, displayName: props.displayName });
          await props.onCreated();
        }}
      >
        Prepare mailbox
      </button>
    </Modal>
  );
}

export function MailboxDetailPage({ setup, refresh, toast }: { setup: SetupSnapshot | null; refresh: () => Promise<void>; toast: (m: string) => void }) {
  const { workspace: slug, mailbox: mailboxId } = useParams();
  const box = setup?.mailboxes.find((m) => m.id === mailboxId);
  const [name, setName] = useState(box?.display_name ?? "");
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  if (!box) return <Empty title="Mailbox not found" body="It may have been removed." />;
  return (
    <>
      <PageHead title={box.address_normalized} subtitle={`Status: ${box.status}. Workspace admin access does not open this mailbox’s messages.`} />
      <div className="card pad form-narrow">
        <TextField label="Display name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex wrap">
          <button
            className="primary"
            onClick={async () => {
              await api.patchMailbox(slug!, box.id, name);
              await refresh();
              toast("Mailbox settings saved.");
            }}
          >
            Save changes
          </button>
          <button className="danger" onClick={() => setDeleting(true)}>
            Delete mailbox
          </button>
        </div>
      </div>
      <div className="card pad" style={{ marginTop: 20 }}>
        <h2>Connect a mail app</h2>
        <p className="sub">Cloudflare v1 is webmail-only. IMAP and SMTP are not offered until a licensed mailbox vendor is configured.</p>
        <RecordCard title="Webmail" type="HTTPS" host="Postlane preview" value="Inbox in this workspace. Not a Gmail clone." status="Preview" tone="gray" />
        <RecordCard title="IMAP / SMTP" type="—" host="Not available" value="Needs a licensed vendor adapter" status="Not offered" tone="gray" />
      </div>
      {deleting ? (
        <Modal title="Delete this mailbox?" onClose={() => setDeleting(false)}>
          <Banner tone="error">Deleting a mailbox removes its email and stops delivery. Export messages first. Retention policy is not configured.</Banner>
          <TextField label="Type the mailbox username to confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} hint={box.local_part} />
          <button
            className="danger"
            onClick={async () => {
              await api.deleteMailbox(slug!, box.id, confirm);
              await refresh();
              toast("Mailbox marked deleted. No mail server was contacted.");
            }}
          >
            Delete mailbox
          </button>
        </Modal>
      ) : null}
    </>
  );
}

export function AliasesPage({ setup, toast }: { setup: SetupSnapshot | null; toast: (m: string) => void }) {
  const { workspace: slug } = useParams();
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [open, setOpen] = useState(false);
  const [localPart, setLocalPart] = useState("contact");
  const dest = setup?.mailboxes[0]?.address_normalized ?? "";
  useEffect(() => {
    if (!slug || slug === "new") return;
    api.aliases(slug).then((r) => setRows(r.aliases as Array<Record<string, string>>));
  }, [slug]);
  return (
    <>
      <PageHead title="Aliases" subtitle="Extra addresses. One place to receive them." action={<button className="primary" onClick={() => setOpen(true)}>Create alias</button>} />
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Address</th>
              <th>Delivers to</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.address_normalized}</td>
                <td>{row.destination_address}</td>
                <td>{row.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? (
        <Modal title="Create alias" onClose={() => setOpen(false)}>
          <TextField label="Alias username" value={localPart} onChange={(e) => setLocalPart(e.target.value)} />
          <p className="sub">Delivers to {dest || "a workspace mailbox"}</p>
          <button
            className="primary"
            onClick={async () => {
              await api.createAlias(slug!, { localPart, destination: dest });
              const latest = await api.aliases(slug!);
              setRows(latest.aliases as Array<Record<string, string>>);
              setOpen(false);
              toast("Alias saved.");
            }}
          >
            Save alias
          </button>
        </Modal>
      ) : null}
    </>
  );
}

export function MigrationPage({ toast }: { toast: (m: string) => void }) {
  const { workspace: slug } = useParams();
  const [source, setSource] = useState("Other provider (IMAP)");
  return (
    <>
      <PageHead title="Bring your email with you" subtitle="Prepare first. Switch delivery when you’re ready." />
      <Banner tone="info">Keep your old provider active until migration and delivery checks are complete.</Banner>
      <div className="two-col">
        <div className="card pad">
          <div className="eyebrow">01 / Prepare</div>
          <h2>Connect your previous provider</h2>
          <div className="field">
            <label htmlFor="oldprovider">Provider</label>
            <select id="oldprovider" value={source} onChange={(e) => setSource(e.target.value)}>
              <option>Other provider (IMAP)</option>
              <option>Google Workspace</option>
              <option>Microsoft 365</option>
            </select>
          </div>
          <button
            className="primary"
            onClick={async () => {
              await api.createMigration(slug!, { sourceProvider: source, sourceHost: "imap.example.com" });
              toast("Migration draft saved. Credentials are not stored, and no copy job was started.");
            }}
          >
            Save mapping draft
          </button>
        </div>
        <div className="card pad">
          <div className="eyebrow">02 / Move & verify</div>
          <h2>Your migration checklist</h2>
          <div className="checklist">
            {["Map source and destination mailboxes", "Run initial message import", "Review skipped messages", "Schedule MX cutover", "Run a final incremental sync", "Test delivery before cancelling old service"].map((item, i) => (
              <div className="row" key={item}>
                <span className="number">{i + 1}</span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
