import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { PLAN_CATALOG, PLAN_IDS, normalizePlan, type PlanId } from "../../shared/domain";
import { SETUP_STEPS, type SetupSnapshot, type SetupStep } from "../types";
import { Banner, Icon, PageHead, RecordCard, TextField } from "../ui";

const LABELS = ["Workspace", "Choose a plan", "Your domain", "Mailboxes", "Connect DNS", "Test delivery"];

function toneFor(status?: string | null) {
  if (status === "valid") return "green";
  if (status === "conflict" || status === "error") return "red";
  if (status === "pending" || status === "checking") return "amber";
  return "gray";
}

export function SetupPage({
  setup,
  refresh,
  toast,
}: {
  setup: SetupSnapshot | null;
  refresh: () => Promise<void>;
  toast: (m: string) => void;
}) {
  const { workspace: slug = "", step = "workspace" } = useParams();
  const navigate = useNavigate();
  const current = (SETUP_STEPS.includes(step as SetupStep) ? step : "workspace") as SetupStep;
  const index = SETUP_STEPS.indexOf(current);
  const [busy, setBusy] = useState(false);
  const [wsName, setWsName] = useState(setup?.workspace?.name ?? "");
  const [recovery, setRecovery] = useState(setup?.workspace?.recovery_email ?? "");
  const [plan, setPlan] = useState<PlanId>(normalizePlan(setup?.subscription?.plan) || "sandbox");
  const [domain, setDomain] = useState(setup?.domain?.name ?? "");
  const [provider, setProvider] = useState("I’m not sure");
  const [existing, setExisting] = useState(Boolean(setup?.domain?.has_existing_mail));
  const [warning, setWarning] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [localPart, setLocalPart] = useState(setup?.mailboxes[0]?.local_part ?? "hello");

  const dns = setup?.dns ?? [];
  const mx = dns.find((d) => d.component === "mx");
  const spf = dns.find((d) => d.component === "spf");
  const ownership = dns.find((d) => d.component === "ownership");

  const blockers = useMemo(() => setup?.gates.filter((g) => !g.ok) ?? [], [setup]);

  async function continueStep() {
    if (!slug || slug === "new") {
      if (current !== "workspace") return toast("Create the workspace first.");
      setBusy(true);
      try {
        const created = await api.createWorkspace({ name: wsName, recoveryEmail: recovery });
        window.location.assign(`/w/${created.workspace.slug}/setup/plan`);
      } catch (e) {
        toast((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      if (current === "workspace") {
        await api.patchWorkspace(slug, { name: wsName, recoveryEmail: recovery });
        navigate(`/w/${slug}/setup/plan`);
      } else if (current === "plan") {
        const checkout = await api.checkout(slug, plan);
        if (checkout.url) {
          window.location.href = checkout.url;
          return;
        }
        toast(checkout.message);
        navigate(`/w/${slug}/setup/domain`);
      } else if (current === "domain") {
        const res = await api.addDomain(slug, { domain, dnsProvider: provider, existingMail: existing });
        if (res.warning) {
          setWarning(res.warning);
          if (!existing) {
            toast(res.warning);
            return;
          }
        }
        await api.checkDns(slug, res.domainId);
        await refresh();
        navigate(`/w/${slug}/setup/mailboxes`);
      } else if (current === "mailboxes") {
        await api.createMailbox(slug, { localPart, displayName: displayName || localPart });
        await refresh();
        navigate(`/w/${slug}/setup/dns`);
      } else if (current === "dns") {
        if (!setup?.domain) return toast("Add a domain first.");
        if (spf?.status === "conflict") return toast("Resolve the SPF conflict before continuing.");
        if (mx?.status !== "valid") return toast("Mail routing is still waiting. Progress is saved.");
        await api.checkDns(slug, setup.domain.id);
        await refresh();
        navigate(`/w/${slug}/setup/delivery`);
      } else if (current === "delivery") {
        const mailbox = setup?.mailboxes[0];
        if (!mailbox) return toast("Prepare a mailbox first.");
        const result = await api.deliveryChecks(slug, mailbox.id);
        await refresh();
        toast(result.message);
      }
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title={setup?.activationAllowed ? "Your email is live" : "Set up your email"} subtitle="Pick up where you left off. Progress is stored on the server." />
      <Banner tone="info">{setup?.provider.message}</Banner>
      <div className="card wizard">
        <aside className="wizard-steps">
          {LABELS.map((label, i) => (
            <button
              key={label}
              className={`wizard-step ghost ${i === index ? "active" : i < index ? "complete" : ""}`}
              onClick={() => slug && slug !== "new" && navigate(`/w/${slug}/setup/${SETUP_STEPS[i]}`)}
            >
              <span className="number">{i < index ? "✓" : i + 1}</span>
              {label}
            </button>
          ))}
        </aside>
        <section className="wizard-body">
          <div className="eyebrow">
            Step {index + 1} of 6
          </div>
          {current === "workspace" ? (
            <>
              <h2>A home for your business email</h2>
              <p className="sub">Your workspace holds your domains, mailboxes, and team.</p>
              <div className="form-narrow">
                <TextField label="Workspace name" value={wsName} onChange={(e) => setWsName(e.target.value)} />
                <TextField
                  label="Recovery email"
                  type="email"
                  hint="Use an address outside the domain you are setting up."
                  value={recovery}
                  onChange={(e) => setRecovery(e.target.value)}
                />
                <Banner tone="info">Account recovery stays accessible even if your business email is unavailable.</Banner>
              </div>
            </>
          ) : null}
          {current === "plan" ? (
            <>
              <h2>A simple plan. Room to grow.</h2>
              <p className="sub">{setup?.pricingNote}</p>
              <div className="plan-grid">
                {PLAN_IDS.map((p) => {
                  const spec = PLAN_CATALOG[p];
                  return (
                  <button key={p} type="button" className={`plan ${plan === p ? "selected" : ""}`} onClick={() => setPlan(p)}>
                    <div className="flex between">
                      <h3>{spec.label}</h3>
                      <span className="sub">{spec.tagline}</span>
                    </div>
                    <div className="plan-price">
                      ${spec.priceCents / 100}
                      <span className="sub"> / workspace / month</span>
                    </div>
                    <ul>
                      {spec.features.slice(0, 3).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </button>
                  );
                })}
              </div>
              <Banner tone="info">{plan === "sandbox" ? "Sandbox includes sending limits without a card. Activation still depends on domain verification." : "Payment is confirmed by a hosted provider webhook. Choosing a plan does not charge a card or raise limits until payment is confirmed."}</Banner>
            </>
          ) : null}
          {current === "domain" ? (
            <>
              <h2>Bring your domain</h2>
              <p className="sub">Use a domain you already own. Your website can stay where it is.</p>
              <div className="form-narrow">
                <TextField label="Domain name" hint="Enter the domain only, without https:// or www." value={domain} onChange={(e) => setDomain(e.target.value)} />
                <div className="field">
                  <label htmlFor="dns-provider">Where do you manage DNS?</label>
                  <select id="dns-provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
                    <option>Cloudflare</option>
                    <option>GoDaddy</option>
                    <option>Namecheap</option>
                    <option>Other provider</option>
                    <option>I’m not sure</option>
                  </select>
                </div>
                <h3>Verify that this domain is yours</h3>
                <p className="sub">Add this TXT record at your DNS provider before connecting email.</p>
                <RecordCard
                  title="Domain ownership"
                  type="TXT"
                  host="_postlane"
                  value={ownership?.expected_value || "Generated after you continue"}
                  status={ownership?.status || "Ready to verify"}
                  tone={toneFor(ownership?.status)}
                />
                <label className="sub">
                  <input type="checkbox" checked={existing} onChange={(e) => setExisting(e.target.checked)} /> I already receive email on this domain
                </label>
                {warning ? <Banner tone="error">{warning} Confirm the checkbox if you still want to continue.</Banner> : null}
              </div>
            </>
          ) : null}
          {current === "mailboxes" ? (
            <>
              <h2>Create your first mailbox</h2>
              <p className="sub">Prepare addresses before changing mail delivery. Prepared is not the same as live.</p>
              <div className="form-narrow">
                <TextField label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                <TextField
                  label="Email username"
                  hint={`Your address will end in @${setup?.domain?.name ?? "your-domain"}`}
                  value={localPart}
                  onChange={(e) => setLocalPart(e.target.value)}
                />
                <Banner tone="info">
                  {normalizePlan(setup?.subscription?.plan) === "sandbox"
                    ? "Sandbox includes one mailbox and one alias. Prepared is not the same as live."
                    : "An alias is an extra address for an existing mailbox. It does not need a separate paid seat."}
                </Banner>
              </div>
            </>
          ) : null}
          {current === "dns" ? (
            <>
              <div className="flex between">
                <h2>Connect your domain</h2>
              </div>
              <p className="sub">
                Add Cloudflare Email Routing records. MX targets isaac.mx.cloudflare.net, linda.mx.cloudflare.net, and amir.mx.cloudflare.net. Your website records stay as they are.
              </p>
              {spf?.status === "conflict" ? (
                <Banner tone="error">
                  <strong>We found a conflicting SPF record.</strong> Keep one SPF policy and merge all legitimate senders.
                </Banner>
              ) : (
                <Banner tone="info">Already using another email provider? Prepare migration and all recipient addresses before switching MX.</Banner>
              )}
              {dns
                .filter((row) => row.component !== "ownership")
                .map((row) => (
                  <RecordCard
                    key={row.component}
                    title={row.component.toUpperCase()}
                    type={row.record_type}
                    host={row.host}
                    value={row.expected_value}
                    status={row.status || "Waiting"}
                    tone={toneFor(row.status)}
                    detected={row.detected_value}
                    lastCheck={row.checked_at}
                    nextCheck={row.next_check_at}
                  />
                ))}
              <button
                type="button"
                onClick={async () => {
                  if (!setup?.domain) return;
                  await api.checkDns(slug, setup.domain.id);
                  await refresh();
                }}
              >
                Check DNS records now
              </button>
              <details>
                <summary>Why aren’t my records showing up?</summary>
                <p>Check the authoritative DNS provider, exact host name, record type, and value. CNAME records must not be proxied. DNS changes do not guarantee inbox placement.</p>
              </details>
            </>
          ) : null}
          {current === "delivery" ? (
            setup?.activationAllowed ? (
              <>
                <div className="success-mark">
                  <Icon name="check" />
                </div>
                <h2>You’re ready to send.</h2>
                <Banner tone="success">Every activation gate passed on the server.</Banner>
              </>
            ) : (
              <>
                <h2>One final check</h2>
                <p className="sub">
                  A mailbox becomes live only when the server confirms every gate, including a real inbound store and an honest SendEmail result.
                </p>
                <div className="checklist">
                  {setup?.gates.map((gate) => (
                    <div key={gate.id} className={`row ${gate.ok ? "done" : "current"}`}>
                      <span className="number">{gate.ok ? "✓" : "•"}</span>
                      {gate.label}
                    </div>
                  ))}
                </div>
                {blockers.length ? (
                  <Banner tone="error">Still blocked: {blockers.map((b) => b.label).join(", ")}.</Banner>
                ) : null}
              </>
            )
          ) : null}
          <div className="wizard-actions">
            <button
              className="ghost"
              type="button"
              onClick={() => {
                if (index === 0) navigate(slug && slug !== "new" ? `/w/${slug}/overview` : "/signup");
                else navigate(`/w/${slug}/setup/${SETUP_STEPS[index - 1]}`);
              }}
            >
              ← Back
            </button>
            <button className="primary" disabled={busy} onClick={continueStep}>
              {current === "dns" ? "Check DNS records" : current === "delivery" ? "Run delivery test" : "Continue"}
              <Icon name="arrow" />
            </button>
          </div>
        </section>
      </div>
      <p className="legend-note">
        Refresh resumes this workspace from the server. DNS values are Cloudflare Email Routing. IMAP still needs a licensed vendor.
      </p>
      <p>
        <Link to={`/w/${slug}/overview`}>Back to overview</Link>
      </p>
    </>
  );
}
