import { useState, type ReactNode } from "react";
import type { DomainHost, SendingRecord } from "./sendingApi";

export type DnsCheckRow = { status?: string; detectedValue?: string | null };

type Field = { label: string; value: string };
type Card = {
  key: string;
  step: number;
  title: string;
  why: string;
  required: boolean;
  check?: string;
  placeholder?: boolean;
  fields: Field[];
};

function mxParts(value: string): { priority: string; host: string }[] {
  const chunks = value.includes(" · ") ? value.split(" · ") : [value];
  return chunks.map((part) => {
    const match = part.trim().match(/^(\d+)\s+(.+)$/);
    return match ? { priority: match[1], host: match[2] } : { priority: "", host: part.trim() };
  });
}

function isPlaceholder(record: SendingRecord) {
  return record.type === "TXT" && record.name.includes("_domainkey") && !/p=[A-Za-z0-9+/]/.test(record.value);
}

function checkKey(record: SendingRecord) {
  if (record.name === "_postlane") return "ownership";
  if (record.type === "MX") return "mx";
  if (record.name.includes("_domainkey")) return "dkim";
  if (record.name === "cf-bounce" && record.type === "TXT") return "spf";
  if (record.name === "_dmarc") return "dmarc";
  return "";
}

function titleFor(record: SendingRecord) {
  if (record.name === "_postlane") return "Prove you own this domain";
  if (record.type === "MX") return "Where bounce replies should go";
  if (record.name.includes("_domainkey")) return "Sign your emails";
  if (record.name === "cf-bounce" && record.type === "TXT") return "Allow sending from this domain";
  if (record.name === "_dmarc") return "Optional: stop others spoofing you";
  return record.purpose || "Add this DNS record";
}

function whyFor(record: SendingRecord) {
  if (record.name === "_postlane") return "A private token only you can publish. We look it up to confirm the domain is yours.";
  if (record.type === "MX") return "Create three MX records with the same host. Your website mail does not change — this is only for bounce handling on cf-bounce.";
  if (record.name.includes("_domainkey")) {
    return isPlaceholder(record)
      ? "Wait for the real key below. Do not invent a DKIM value. After the other records are in, click Check DNS and we will try to fill this."
      : "Paste this exact signing key. Inboxes use it to confirm the message came from you.";
  }
  if (record.name === "cf-bounce" && record.type === "TXT") return "Lets receiving servers accept mail that Cloudflare sends for you.";
  if (record.name === "_dmarc") return "Nice to have. Start with none. You can tighten it later.";
  return record.purpose;
}

export function previewDnsRecords(domain: string): SendingRecord[] {
  return [
    { type: "TXT", name: "_postlane", value: "postlane-send=preview", purpose: "", hostname: `_postlane.${domain}`, required: true },
    {
      type: "MX",
      name: "cf-bounce",
      value: "10 isaac.mx.cloudflare.net · 20 linda.mx.cloudflare.net · 30 amir.mx.cloudflare.net",
      purpose: "",
      hostname: `cf-bounce.${domain}`,
      required: true,
    },
    { type: "TXT", name: "cf-bounce", value: "v=spf1 include:_spf.mx.cloudflare.net ~all", purpose: "", hostname: `cf-bounce.${domain}`, required: true },
    { type: "TXT", name: "cf-bounce._domainkey", value: "v=DKIM1 — waiting for the real key", purpose: "", hostname: `cf-bounce._domainkey.${domain}`, required: true },
    { type: "TXT", name: "_dmarc", value: "v=DMARC1; p=none", purpose: "", hostname: `_dmarc.${domain}`, required: false },
  ];
}

export function dnsCards(records: SendingRecord[]): Card[] {
  const cards: Card[] = [];
  for (const record of records) {
    const last = cards[cards.length - 1];
    if (record.type === "MX" && last?.check === "mx" && last.key.startsWith("mx:")) {
      for (const part of mxParts(record.value)) {
        last.fields.push({ label: part.priority ? `Mail server · priority ${part.priority}` : "Mail server", value: part.host });
      }
      continue;
    }
    const fields: Field[] = [{ label: "Type", value: record.type }, { label: "Host / Name", value: record.name || "@" }];
    if (record.type === "MX") {
      for (const part of mxParts(record.value)) {
        fields.push({ label: part.priority ? `Mail server · priority ${part.priority}` : "Mail server", value: part.host });
      }
    } else {
      fields.push({ label: "Value", value: record.value });
    }
    cards.push({
      key: `${record.type}:${record.name}:${record.value}`,
      step: 0,
      title: titleFor(record),
      why: whyFor(record),
      required: record.required,
      check: checkKey(record),
      placeholder: isPlaceholder(record),
      fields,
    });
  }
  return cards.map((card, index) => ({ ...card, step: index + 1 }));
}

function statusView(status?: string, checking?: boolean) {
  if (checking) return { label: "Checking", tone: "busy", card: "checking" };
  if (status === "valid") return { label: "Found", tone: "ok", card: "found" };
  if (status === "pending") return { label: "Not found yet", tone: "wait", card: "missing" };
  if (status === "conflict") return { label: "Doesn’t match", tone: "bad", card: "missing" };
  if (status === "error") return { label: "Couldn’t check", tone: "bad", card: "missing" };
  return null;
}

export function DnsGuide({
  domain,
  records,
  checks,
  copy,
  host,
  onApply,
  onShowToken,
  applying,
  checking,
  children,
}: {
  domain: string;
  records: SendingRecord[];
  checks?: Record<string, DnsCheckRow>;
  copy: (text: string) => void;
  host?: DomainHost;
  onApply?: () => void;
  onShowToken?: () => void;
  applying?: boolean;
  checking?: boolean;
  children?: ReactNode;
}) {
  const [manual, setManual] = useState(false);
  const [review, setReview] = useState(false);
  const cards = dnsCards(records.length ? records : previewDnsRecords(domain));
  const required = cards.filter((card) => card.required).length;
  const label = host?.label || (host?.provider === "cloudflare" ? "Cloudflare" : "your DNS host");
  const cloudflare = host?.provider === "cloudflare";
  const nameservers = host?.nameservers?.length ? host.nameservers.join(" · ") : "";
  const showRecords = !cloudflare || manual || review || host?.canApply;
  return (
    <div className="pl-dnsguide">
      <div className={`pl-cfbar ${cloudflare ? "cf" : ""}`}>
        <p className="pl-eyebrow">DNS RECORDS</p>
        <strong>{cloudflare ? "Authorize DNS changes" : `Add records in ${label}`}</strong>
        {nameservers ? <p className="pl-ns">Nameservers: <code>{nameservers}</code></p> : null}
        {cloudflare ? (
          <p>
            {host?.canApply
              ? "These records were added in Cloudflare. Check DNS when you are ready."
              : review
                ? "Review the records Postlane will add, then authorize. This does not grant later changes."
                : "Sign in to Cloudflare to authorize adding these sending records. It is a one-time authorization."}
          </p>
        ) : (
          <p>
            Add the {required} required records below in <strong>{label}</strong>
            {host?.zone ? <> for <code>{host.zone}</code></> : null}. Host / Name is <code>_postlane</code> or{" "}
            <code>cf-bounce</code> — do not add <code>.{domain}</code> unless that panel asks for a full hostname.
          </p>
        )}
        {cloudflare && !host?.canApply ? (
          <div className="pl-actions">
            {review ? (
              <button type="button" className="pl-btn" disabled={applying} onClick={onShowToken}>
                {applying ? "Adding records…" : "Authorize"}
              </button>
            ) : (
              <button type="button" className="pl-btn" disabled={applying} onClick={() => setReview(true)}>
                Auto configure
              </button>
            )}
            <button
              type="button"
              className="pl-btn pl-secondary"
              onClick={() => {
                setManual((value) => !value);
                setReview(false);
              }}
            >
              {manual ? "Hide records" : "Manual setup"}
            </button>
          </div>
        ) : null}
        {children}
      </div>
      {cloudflare && !host?.canApply && review ? (
        <p className="pl-dnsquiet">Authorize adds these records in Cloudflare for {domain}.</p>
      ) : cloudflare && !host?.canApply && !manual ? (
        <p className="pl-dnsquiet">Auto configure shows the records to add. Authorize writes them.</p>
      ) : null}
      {showRecords ? (() => {
        const scored = cards.map((card) => {
          const check = card.check ? checks?.[card.check] : undefined;
          const view = card.check ? statusView(check?.status, Boolean(checking)) : null;
          return { card, check, view };
        });
        const required = scored.filter((row) => row.card.required && row.card.check);
        const found = required.filter((row) => row.view?.card === "found").length;
        const seen = checking || required.some((row) => row.check);
        const complete = !checking && required.length > 0 && found === required.length;
        return <>
          {seen ? (
            <div className={`pl-dnsmeter ${complete ? "done" : checking ? "busy" : "partial"}`} role="status">
              <strong>{checking ? "Checking DNS" : complete ? "All required records found" : `${found} of ${required.length} found`}</strong>
              <div className="pl-dnsbar" aria-hidden="true"><i style={{ width: `${checking ? 35 : Math.round((found / Math.max(required.length, 1)) * 100)}%` }} /></div>
            </div>
          ) : null}
          {scored.map(({ card, view }) => (
          <article key={card.key} className={[card.required ? "" : "optional", view?.card || ""].filter(Boolean).join(" ")}>
            <header>
              <span>{view?.card === "found" ? "✓" : card.step}</span>
              <div>
                <strong>{card.title}</strong>
                <small>{card.required ? "Required" : "Optional"}</small>
              </div>
              {view ? <em className={`pl-dnsstatus ${view.tone}`}><i />{view.label}</em> : null}
            </header>
            <p>{card.why}</p>
            {card.placeholder ? <p className="pl-dnsnote">No real key yet. Skip this row until a value starting with <code>v=DKIM1; p=</code> appears.</p> : null}
            <dl>
              {card.fields.map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>
                    <code>{field.value}</code>
                    {!card.placeholder ? (
                      <button type="button" className="pl-linkbutton" onClick={() => copy(field.value)}>
                        Copy
                      </button>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
          ))}
        </>;
      })() : null}
    </div>
  );
}
