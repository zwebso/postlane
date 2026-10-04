import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { normalizePlan, PLAN_CATALOG, PLAN_IDS } from '../shared/domain';
import { DnsGuide } from './DnsGuide';
import { PREVIEW_VARIABLES, renderTemplate, templateVariableNames, type MailTemplate } from '../shared/templates';
import { sendingApi, SendingError, type DomainHost, type SendingActivity, type SendingHealthRow, type SendingLimits, type SendingPlan, type SendingRecord, type SendingUsage } from './sendingApi';
import './sending.css';

type Email = { id: string; to: string; subject: string; status: string; time: string; detail?: string | null };
type Domain = { name: string; status: string; host?: string; provider?: string; nameservers?: string[] };
type Key = { name: string; scope: string; tail: string };
const navGroups: [string, [string, string, string][]][] = [
  ["Send", [["overview","Overview","grid"],["emails","Emails","mail"],["domains","Domains","globe"],["api-keys","API keys","key"],["templates","Templates","template"]]],
  ["Deliver", [["webhooks","Webhooks","zap"],["suppressions","Suppressions","ban"]]],
  ["Account", [["usage","Usage & billing","chart"],["team","Team","users"],["settings","Settings","settings"]]],
];
const nav = navGroups.flatMap((group) => group[1]);
const GLYPHS: Record<string, string> = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  globe: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM4 12h16M12 4c2.2 2.4 3.3 5.2 3.3 8s-1.1 5.6-3.3 8c-2.2-2.4-3.3-5.2-3.3-8s1.1-5.6 3.3-8z",
  key: "M8 15a5 5 0 1 1 4.5-7H21v4h-2v2h-2v-2h-4.2A5 5 0 0 1 8 15z",
  template: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4",
  zap: "M13 2 4 14h7l-1 8 9-12h-7l1-8z",
  ban: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM7.5 16.5l9-9",
  chart: "M4 19V4M4 19h16M8 16V10M12 16V7M16 16v-4",
  users: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3.5 19c.6-2.8 2.6-4 5.5-4s4.9 1.2 5.5 4M14 19c.3-1.8 1.5-3 3.2-3 1.4 0 2.5.7 3.3 2",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 3.5v2.2M12 18.3V20.5M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5L6 16zM10 19a2 2 0 0 0 4 0",
};
function Glyph({name}:{name:string}){
  return <svg className="pl-navicon" viewBox="0 0 24 24" aria-hidden="true"><path d={GLYPHS[name] || GLYPHS.grid} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
const HERO_SENDS = [
  { word: 'welcome', file: 'send-welcome.ts', comment: 'Welcome mail, one request.', subject: 'Welcome aboard', preview: 'You’re in, Alex.', body: 'Your account is ready. This is the first mail your product sends with Postlane.', cta: 'Open the app', delivered: 'Welcome email delivered.', id: 'em_welcome_001', caption: 'API KEY → POST /V1/EMAILS → WELCOME DELIVERED' },
  { word: 'confirmation', file: 'send-confirm.ts', comment: 'Confirm the address.', subject: 'Confirm your email', preview: 'Confirm this address.', body: 'One tap verifies the account. Transactional mail, not a mailbox.', cta: 'Confirm email', delivered: 'Confirmation delivered.', id: 'em_confirm_001', caption: 'API KEY → POST /V1/EMAILS → CONFIRMATION DELIVERED' },
  { word: 'billing', file: 'send-billing.ts', comment: 'Receipts, one request.', subject: 'Your receipt', preview: 'Payment received · $42', body: 'Billing mail leaves from your domain when a charge succeeds.', cta: 'View receipt', delivered: 'Billing email delivered.', id: 'em_billing_001', caption: 'API KEY → POST /V1/EMAILS → BILLING DELIVERED' },
  { word: 'password reset', file: 'send-reset.ts', comment: 'A fresh start, one request.', subject: 'Reset your password', preview: 'Choose a new password.', body: 'The reset link is the product talking. Postlane just sends it.', cta: 'Reset password', delivered: 'Password reset delivered.', id: 'em_reset_001', caption: 'API KEY → POST /V1/EMAILS → RESET DELIVERED' },
  { word: 'shipping', file: 'send-shipping.ts', comment: 'On the way, one request.', subject: 'Your order is on the way', preview: 'Package out for delivery.', body: 'Shipping updates are transactional. They leave when the label does.', cta: 'Track package', delivered: 'Shipping email delivered.', id: 'em_ship_001', caption: 'API KEY → POST /V1/EMAILS → SHIPPING DELIVERED' },
  { word: 'magic link', file: 'send-login.ts', comment: 'Sign in, one request.', subject: 'Your sign-in link', preview: 'Tap to sign in.', body: 'A login link is still transactional email — not an inbox we host.', cta: 'Sign in', delivered: 'Magic link delivered.', id: 'em_login_001', caption: 'API KEY → POST /V1/EMAILS → MAGIC LINK DELIVERED' },
] as const;
function swapCh(word: string) {
  return Math.max(...word.split(/\s+/).map((part) => part.length));
}
const code = `const response = await fetch(\n  '/v1/emails', {\n    method: 'POST',\n    headers: {\n      Authorization: 'Bearer pl_live_YOUR_API_KEY',\n      'Content-Type': 'application/json',\n      'Idempotency-Key': 'welcome-user-123'\n    },\n    body: JSON.stringify({\n      from: 'hello@send.yourdomain.com',\n      to: ['alex@example.com'],\n      subject: 'Welcome to the good part',\n      html: '<h1>You’re in.</h1>'\n    })\n  }\n);`;
function Mark() { return <span className="pl-mark" aria-hidden="true"><i/><i/><i/></span>; }
function Brand() { return <Link to="/" className="pl-brand"><Mark/>postlane</Link>; }
function Button({children,onClick,secondary=false,type='button',disabled=false}: {children:ReactNode;onClick?:()=>void;secondary?:boolean;type?:'button'|'submit';disabled?:boolean}) { return <button disabled={disabled} type={type} className={`pl-btn ${secondary?'pl-secondary':''}`} onClick={onClick}>{children}</button>; }
function openCloudflarePopup(domain: string) {
  return new Promise<{ ok: boolean; reason?: string }>((resolve) => {
    const started = Date.now();
    try { localStorage.removeItem("postlane-cf-oauth"); } catch { /* ignore */ }
    const popup = window.open(
      `/api/auth/cloudflare?domain=${encodeURIComponent(domain)}&popup=1`,
      "postlane-cloudflare",
      "width=1100,height=820",
    );
    if (!popup) {
      window.location.assign(`/api/auth/cloudflare?domain=${encodeURIComponent(domain)}`);
      resolve({ ok: false, reason: "Allow the Cloudflare window, then try again." });
      return;
    }
    popup.focus();
    let finished = false;
    const done = (ok: boolean, reason?: string) => {
      if (finished) return;
      finished = true;
      window.removeEventListener("message", onMsg);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(tick);
      resolve({ ok, reason });
    };
    const readPayload = (raw: unknown) => {
      if (!raw || typeof raw !== "object") return;
      const data = raw as { type?: string; ok?: boolean; reason?: string; t?: number };
      if (data.type && data.type !== "postlane-cloudflare") return;
      if (typeof data.t === "number" && data.t < started) return;
      if (typeof data.ok === "boolean") done(data.ok, data.reason);
    };
    const onMsg = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      readPayload(event.data);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "postlane-cf-oauth" || !event.newValue) return;
      try { readPayload({ type: "postlane-cloudflare", ...JSON.parse(event.newValue) }); } catch { /* ignore */ }
    };
    window.addEventListener("message", onMsg);
    window.addEventListener("storage", onStorage);
    const tick = window.setInterval(() => {
      try {
        const raw = localStorage.getItem("postlane-cf-oauth");
        if (raw) readPayload({ type: "postlane-cloudflare", ...JSON.parse(raw) });
      } catch { /* ignore */ }
    }, 500);
  });
}
function waitForDomainConnect() {
  return new Promise<{ ok: boolean; domain?: string; error?: string }>((resolve) => {
    const started = Date.now();
    try { localStorage.removeItem("postlane-dc"); } catch { /* ignore */ }
    let finished = false;
    const done = (ok: boolean, domain?: string, error?: string) => {
      if (finished) return;
      finished = true;
      window.removeEventListener("message", onMsg);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(tick);
      resolve({ ok, domain, error });
    };
    const readPayload = (raw: unknown) => {
      if (!raw || typeof raw !== "object") return;
      const data = raw as { type?: string; ok?: boolean; domain?: string; error?: string; t?: number };
      if (data.type !== "postlane-domain-connect") return;
      if (typeof data.t === "number" && data.t < started) return;
      if (typeof data.ok === "boolean") done(data.ok, data.domain, data.error);
    };
    const onMsg = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      readPayload(event.data);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "postlane-dc" || !event.newValue) return;
      try { readPayload(JSON.parse(event.newValue)); } catch { /* ignore */ }
    };
    window.addEventListener("message", onMsg);
    window.addEventListener("storage", onStorage);
    const tick = window.setInterval(() => {
      try {
        const raw = localStorage.getItem("postlane-dc");
        if (raw) readPayload(JSON.parse(raw));
      } catch { /* ignore */ }
    }, 500);
  });
}
function Badge({status}:{status:string}) { return <span className={`pl-badge ${/Bounced|Failed|Revoked|Rejected|Complained|Paused/.test(status)?'bad':/Pending|Deferred|Unverified|Queued/.test(status)?'warn':''}`}><span/> {status}</span>; }
function statusNote(status:string, detail?:string|null) {
  if (status==='Queued') return 'Cloudflare has the message and is still delivering it.';
  if (status==='Deferred') return detail || 'The recipient server asked Cloudflare to retry.';
  if (status==='Bounced') return detail || 'The recipient server permanently refused the message.';
  if (status==='Complained') return detail || 'The recipient reported this message as spam.';
  if (status==='Delivered') return 'The recipient server accepted the message. Inbox placement is separate.';
  if (status==='Accepted') return 'The provider accepted the message. Inbox placement is a later event.';
  if (status==='Rejected') return detail && !/suppression list/i.test(detail) ? detail : 'This address is on the suppression list, so the send was not attempted.';
  if (status==='Failed') return detail || 'The provider did not accept the message.';
  return detail || 'Recorded with this status.';
}
function Head({eyebrow,title,description,action}:{eyebrow?:string;title:string;description:string;action?:ReactNode}) { return <div className="pl-pagehead"><div>{eyebrow&&<p className="pl-eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p></div>{action}</div>; }
function Modal({title,close,children,wide=false}:{title:string;close:()=>void;children:ReactNode;wide?:boolean}) {
 const ref=useRef<HTMLElement>(null), closeRef=useRef(close);closeRef.current=close;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const dialog=ref.current;const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';const focusable=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]')||[]);(dialog?.querySelector<HTMLElement>('input')||focusable()[0])?.focus();
 const f=(e:KeyboardEvent)=>{if(e.key==='Escape')closeRef.current();if(e.key==='Tab'){const items=focusable(),first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',f);return()=>{document.removeEventListener('keydown',f);document.body.style.overflow=oldOverflow;previous?.focus();};},[]);
 return <div className="pl-overlay" onClick={close}><section ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`pl-modal ${wide?'pl-modal-wide':''}`} onClick={e=>e.stopPropagation()}><button className="pl-close" onClick={close} aria-label="Close dialog">×</button><h2>{title}</h2>{children}</section></div>;
}
function PublicHeader(){
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return <header className="pl-publicnav"><Brand/><nav id="pl-public-nav" aria-label="Main navigation" className={open ? "is-open" : undefined}><a href="/#product" onClick={close}>Product</a><Link to="/pricing" onClick={close}>Pricing</Link><Link to="/docs" onClick={close}>Developers</Link><Link to="/changelog" onClick={close}>Changelog</Link><Link className="pl-menu-login" to="/login" onClick={close}>Log in</Link></nav><div className="pl-publicactions"><button type="button" className="pl-navtoggle" aria-expanded={open} aria-controls="pl-public-nav" onClick={() => setOpen((value) => !value)}>{open ? "Close" : "Menu"}</button><Link className="pl-header-login" to="/login">Log in</Link><Link className="pl-btn" to="/signup">Start sending</Link></div></header>;
}
function Footer(){return <footer className="pl-footer"><div><Brand/><p>Transactional email for your product.</p><small>© 2026 Postlane</small></div><div><strong>Build</strong><Link to="/docs">Documentation</Link><Link to="/login">Sign in</Link><Link to="/pricing">Pricing</Link></div><div><strong>Company</strong><Link to="/about">About</Link><Link to="/contact">Contact</Link><Link to="/status">Service status</Link></div><div><strong>Trust</strong><Link to="/security">Security</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/acceptable-use">Acceptable use</Link></div></footer>;}
function Home(){
  const [send, setSend] = useState(0);
  const [leaving, setLeaving] = useState<string>();
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches) return;
    const timer = window.setInterval(() => {
      setSend((index) => {
        setLeaving(HERO_SENDS[index].word);
        return (index + 1) % HERO_SENDS.length;
      });
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);
  const current = HERO_SENDS[send];
  const serves = [
    {kind:'Welcome email', subject:'You’re in, Alex.', from:'hello@send.acme.com'},
    {kind:'Verify address', subject:'Confirm this email', from:'hello@send.acme.com'},
    {kind:'Password reset', subject:'Reset your password', from:'hello@send.acme.com'},
    {kind:'Receipt', subject:'Payment received · $42', from:'billing@send.acme.com'},
  ];
  return <div className="pl-public"><PublicHeader/><main>
    <section className="pl-hero">
      <div className="pl-hero-copy">
        <Link className="pl-announcement" to="/docs"><span/> Transactional email API</Link>
        <h1>
          <span className="pl-sr-only">Send {current.word} from your app. Not an inbox.</span>
          <span aria-hidden="true">Send <span className="pl-swap"><span className="pl-swap-sizer" aria-hidden="true">password reset</span>{leaving ? <span className="pl-swap-word out" key={`out-${leaving}`} style={{['--swap-ch' as string]: swapCh(leaving)}}>{leaving}</span> : null}<span className={`pl-swap-word ${leaving ? 'in' : 'still'}`} key={`in-${current.word}`} style={{['--swap-ch' as string]: swapCh(current.word)}}>{current.word}</span></span><br/>from your app.<br/><em>Not an inbox.</em></span>
        </h1>
        <p>Postlane is the email API for product mail. Create a sending key, call <code>POST /v1/emails</code>, and your welcome, confirmation, billing, and other transactional messages leave with your domain on them.</p>
        <div className="pl-heropills" aria-label="What Postlane sends">
          {HERO_SENDS.map((item, index) => <span key={item.word} className={index === send ? 'on' : ''}>{item.word}</span>)}
        </div>
        <div className="pl-actions">
          <Link to="/signup" className="pl-btn">Create a sending key</Link>
          <Link to="/docs" className="pl-textlink">See the send API <span>→</span></Link>
        </div>
        <small>Verify a domain, keep the key on your server, then send. Accepted is not inbox placement.</small>
      </div>
      <div className="pl-hero-art" aria-hidden="true">
        <div className="pl-keychip"><span className="pl-dot"/> pl_live_•••• a9f2 · send</div>
        <div className="pl-codewindow">
          <div className="pl-windowbar"><span>● ● ●</span><span>{current.file}</span><span>TS</span></div>
          <pre><span className="pl-comment">{`// ${current.comment}`}</span>{'\n'}Authorization: Bearer pl_live_…{'\n\n'}<span className="pl-codeorange">POST</span>{` /v1/emails\n\n{\n  "from": "hello@send.acme.com",\n  "to": "alex@example.com",\n  "subject": "${current.subject}"\n}`}</pre>
          <div className="pl-coderesponse"><span>202 Accepted</span><span>{current.id}</span></div>
        </div>
        <article className="pl-welcome-card">
          <header><Mark/><span>{current.subject}</span></header>
          <strong>{current.preview}</strong>
          <p>{current.body}</p>
          <span className="pl-welcomecta">{current.cta}</span>
        </article>
        <div className="pl-deliveryfloat">
          <span className="pl-successicon">✓</span>
          <div><strong>{current.delivered}</strong><small>Recipient server accepted</small></div>
        </div>
      </div>
    </section>
    <section className="pl-servebar" aria-labelledby="pl-serve-heading">
      <div className="pl-servebar-copy">
        <p className="pl-eyebrow">WHAT WE SERVE</p>
        <h2 id="pl-serve-heading">The mail your product has to send.</h2>
        <p>Not newsletters. Not a hosted inbox. Transactional email that leaves when someone signs up, resets a password, or pays.</p>
      </div>
      <div className="pl-servecards">
        {serves.map((item)=>(
          <article key={item.kind} className="pl-servecard">
            <span>{item.kind}</span>
            <strong>{item.subject}</strong>
            <small>{item.from}</small>
          </article>
        ))}
      </div>
    </section>
    <section id="product" className="pl-section">
      <div className="pl-sectionheading">
        <p className="pl-eyebrow">THE SERVICE, IN THREE MOVES</p>
        <h2>A key, a send,<br/>and a welcome that arrives.</h2>
        <p>Everything on this page is the product: scoped keys, transactional requests, and a clear record of what happened next.</p>
      </div>
      <div className="pl-featuregrid">
        <article>
          <span className="pl-featureicon"><Glyph name="key"/></span>
          <h3>A sending key for your app</h3>
          <p>Create a scoped API key, keep it on your server, and authorize <code>POST /v1/emails</code>. The secret is shown once. Production and test stay apart.</p>
          <Link to="/app/api-keys">Create an API key →</Link>
        </article>
        <article>
          <span className="pl-featureicon"><Glyph name="mail"/></span>
          <h3>Welcome and transactional mail</h3>
          <p>Send the first hello, the verify-your-address note, the password reset, and the receipt. Same API. Your domain in the From line.</p>
          <Link to="/docs">Read the send request →</Link>
        </article>
        <article>
          <span className="pl-featureicon"><Glyph name="zap"/></span>
          <h3>See the send leave</h3>
          <p>Follow accepted, delivered, deferred, and bounced. Delivered means the recipient server took the message — not that it landed in the inbox.</p>
          <Link to="/app/emails">Follow email events →</Link>
        </article>
      </div>
    </section>
    <section className="pl-demo-section">
      <div>
        <p className="pl-eyebrow">FROM KEY TO FIRST SEND</p>
        <h2>Your first welcome<br/>email, in order.</h2>
        <p>Connect a sending domain, mint a key, then send a test welcome. Each step has a next action. Nothing is implied.</p>
        <Link className="pl-btn" to="/app/setup">Try the guided setup</Link>
      </div>
      <div className="pl-stepscard">{[['01','Connect a sending domain','Prove you own the domain that will appear after From.'],['02','Create a scoped API key','Give production and preview their own credentials.'],['03','Send a welcome email','POST /v1/emails and watch accepted become delivered.']].map(([n,t,d])=><div key={n}><span>{n}</span><section><h3>{t}</h3><p>{d}</p></section></div>)}</div>
    </section>
    <section className="pl-section pl-faq">
      <div>
        <p className="pl-eyebrow">BEFORE YOU BUILD</p>
        <h2>A few good questions.</h2>
      </div>
      <div>{[['Is Postlane a mailbox service?','No. Postlane is a transactional email API for welcome messages, verification, password resets, and receipts. It is not an inbox, IMAP, or a mailbox subscription.'],['What do I send with an API key?','A server-side POST /v1/emails request. Authorize with Bearer pl_live_…, set from/to/subject, and include an Idempotency-Key for retries. The key stays on your server.'],['Can I send real email today?','After you sign in, verify a sending domain, and create a key, POST /v1/emails stores the send and submits it if Email Sending is bound. Local development uses a mock provider unless that binding is present. Accepted is not inbox placement.'],['What does delivered mean?','Delivered means the recipient’s mail server accepted the message. It does not guarantee inbox placement or that the recipient read it.']].map(([q,a])=><details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div>
    </section>
    <section className="pl-section" id="pricing">
      <div className="pl-sectionheading">
        <p className="pl-eyebrow">SIMPLE BY DESIGN</p>
        <h2>Room to build. Room to grow.</h2>
        <p>Sandbox is free. Launch and Scale raise domains and monthly volume. Paid limits apply after payment is connected.</p>
      </div>
      <PlanCards/>
    </section>
    <section className="pl-finalcta">
      <Mark/>
      <h2>Send the next welcome<br/>from your product.</h2>
      <p>Create a key, send a test, and follow it from request to delivered.</p>
      <Link className="pl-btn" to="/signup">Create a sending key</Link>
    </section>
  </main><Footer/></div>;
}

export function SendingApp(){
 const [emails,setEmails]=useState<Email[]>([]),[domains,setDomains]=useState<Domain[]>([]);
 const [keys,setKeys]=useState<Key[]>([]);
 const [hooks,setHooks]=useState<{url:string;status:string}[]>([]);
 const [suppressions,setSuppressions]=useState<string[]>([]);
 const [toast,setToast]=useState('');
 const location=useLocation();
 useEffect(()=>{window.scrollTo(0,0);},[location.pathname]);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),4200);return()=>clearTimeout(t);},[toast]);
 const notify=(s:string)=>setToast(s);
 return <div className="pl-root"><Routes><Route path="/" element={<Home/>}/><Route path="/app/*" element={<Dashboard emails={emails} setEmails={setEmails} domains={domains} setDomains={setDomains} keys={keys} setKeys={setKeys} hooks={hooks} setHooks={setHooks} suppressions={suppressions} setSuppressions={setSuppressions} notify={notify}/>}/><Route path="/signup" element={<Auth signup/>}/><Route path="/login" element={<Auth/>}/><Route path="/forgot-password" element={<Auth reset/>}/><Route path="/reset-password" element={<ResetPassword/>}/><Route path="/verify-email" element={<VerifyEmail/>}/><Route path="/invitations/:token" element={<InvitationPage/>}/><Route path="/:page" element={<PublicPage/>}/><Route path="*" element={<PublicPage/>}/></Routes>{toast&&<div className="pl-toast" role="status">✓ {toast}</div>}</div>;
}
const sandboxSpec=PLAN_CATALOG.sandbox;
const defaultPlan:SendingPlan={id:'sandbox',label:'Sandbox',requested:'sandbox',status:'active',entitled:'sandbox'};
const defaultLimits:SendingLimits={domains:sandboxSpec.domainLimit,emailsPerDay:sandboxSpec.emailsPerDay,emailsPerMonth:sandboxSpec.emailsPerMonth,apiKeys:sandboxSpec.apiKeyLimit,webhooks:sandboxSpec.webhookLimit,eventRetentionDays:sandboxSpec.eventRetentionDays,rateLimitPerSecond:sandboxSpec.rateLimitPerSecond,teamRoles:sandboxSpec.teamRoles};
type Hook={id?:string;url:string;status:string};
type DashProps={emails:Email[];setEmails:(e:Email[])=>void;domains:Domain[];setDomains:(d:Domain[])=>void;keys:Key[];setKeys:(k:Key[])=>void;hooks:Hook[];setHooks:(h:Hook[])=>void;suppressions:string[];setSuppressions:(s:string[])=>void;notify:(s:string)=>void};
function blankTemplate(): MailTemplate {
  return { id: null, name: "", subject: "Hello, {{first_name}}", html: "<p>Hi {{first_name}},</p>", text: "Hi {{first_name}},", starter: false };
}

function TemplateEditor({ templates, setTemplates, notify, onTest }: { templates: MailTemplate[]; setTemplates: (next: MailTemplate[]) => void; notify: (message: string) => void; onTest: (rendered: { subject: string; html: string; text: string }) => void }) {
  const [key, setKey] = useState(templates[0] ? templates[0].id || templates[0].name : "");
  const [draft, setDraft] = useState<MailTemplate | null>(templates[0] ? { ...templates[0] } : null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sawTemplates = useRef(templates.length > 0);
  useEffect(() => {
    if (sawTemplates.current || !templates.length) return;
    sawTemplates.current = true;
    setKey(templates[0].id || templates[0].name);
    setDraft({ ...templates[0] });
  }, [templates]);
  if (!draft) return <div className="pl-empty"><strong>Loading templates…</strong></div>;
  const current = draft;
  const variables = templateVariableNames(current.subject, current.html, current.text);
  const previewSubject = renderTemplate(current.subject, PREVIEW_VARIABLES);
  const previewHtml = renderTemplate(current.html, PREVIEW_VARIABLES, "html");
  const previewText = renderTemplate(current.text, PREVIEW_VARIABLES);
  function choose(item: MailTemplate) {
    setCreating(false);
    setError("");
    setKey(item.id || item.name);
    setDraft({ ...item });
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const saved = await sendingApi.saveTemplate({ id: current.id, name: current.name, subject: current.subject, html: current.html, text: current.text });
      const next = templates.some((item) => item.name === saved.name || item.id === saved.id)
        ? templates.map((item) => (item.name === saved.name || item.id === saved.id ? saved : item))
        : [...templates, saved];
      setCreating(false);
      setKey(saved.id || saved.name);
      setDraft(saved);
      setTemplates(next);
      notify("Template saved.");
    } catch (err) {
      setError(err instanceof SendingError ? err.message : "Could not save this template.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!current.id) return;
    setBusy(true);
    setError("");
    try {
      const result = await sendingApi.deleteTemplate(current.id);
      const next = result.restored
        ? templates.map((item) => (item.id === current.id ? result.restored! : item))
        : templates.filter((item) => item.id !== current.id);
      setTemplates(next);
      const focus = result.restored || next[0];
      if (focus) choose(focus);
      notify(result.restored ? "Built-in template restored." : "Template deleted.");
    } catch (err) {
      setError(err instanceof SendingError ? err.message : "Could not delete this template.");
    } finally {
      setBusy(false);
    }
  }
  return <>
    <Head title="Templates" description="Write the message once, then fill {{first_name}} and the other variables when you send." action={<Button onClick={() => { setCreating(true); setError(""); setDraft(blankTemplate()); }}>+ New template</Button>} />
    <div className="pl-template-layout">
      <div className="pl-template-list">
        {templates.map((item) => <button type="button" className={!creating && (item.id || item.name) === key ? "chosen" : ""} key={item.id || item.name} onClick={() => choose(item)}><strong>{item.name}</strong><small>{item.subject}</small></button>)}
      </div>
      <div className="pl-template-editor">
        <section className="pl-panel pl-editor">
          <h2>{creating ? "New template" : current.starter ? "Built-in template" : "Template"}</h2>
          <label>Name<input value={current.name} disabled={Boolean(current.starter)} onChange={(e) => setDraft({ ...current, name: e.target.value })} /></label>
          <label>Subject<input value={current.subject} onChange={(e) => setDraft({ ...current, subject: e.target.value })} /></label>
          <label>HTML body<textarea value={current.html} rows={8} onChange={(e) => setDraft({ ...current, html: e.target.value })} /></label>
          <label>Plain text<textarea value={current.text} rows={5} onChange={(e) => setDraft({ ...current, text: e.target.value })} /></label>
          <p>Variables: {variables.length ? variables.map((name) => <code key={name}>{`{{${name}}}`}</code>) : "none yet"}. Preview uses Alex for first_name.</p>
          {error && <p className="pl-error" role="alert">{error}</p>}
          <div className="pl-actions">
            <Button disabled={busy} onClick={() => void save()}>Save template</Button>
            <Button secondary disabled={busy || !current.subject || (!current.html && !current.text)} onClick={() => onTest({ subject: previewSubject, html: previewHtml, text: previewText })}>Send test</Button>
            {current.id && <Button secondary disabled={busy} onClick={() => void remove()}>{current.starter ? "Restore built-in" : "Delete"}</Button>}
          </div>
        </section>
        <section className="pl-panel pl-template-preview">
          <h2>{previewSubject || "Preview"}</h2>
          <iframe title="Template preview" sandbox="" srcDoc={previewHtml || `<pre>${previewText.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char] || char)}</pre>`} />
        </section>
      </div>
    </div>
    <p className="pl-footnote">POST /v1/emails can send <code>template</code> and <code>variables</code> instead of writing the subject and body in every request.</p>
  </>;
}

function OperationsPanel({ notify }: { notify: (message: string) => void }) {
  const [rows, setRows] = useState<SendingHealthRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  async function load() {
    try {
      const data = await sendingApi.operations();
      setRows(data.workspaces);
      setError("");
    } catch (err) {
      setError(err instanceof SendingError ? err.message : "Could not load operations.");
    }
  }
  useEffect(() => { void load(); }, []);
  return <>
    <Head eyebrow="ACROSS WORKSPACES" title="Operations" description="Bounce and failure health for every workspace that sent mail today, plus any pause waiting for review." />
    {error && <div className="pl-notice">{error}</div>}
    <section className="pl-panel"><div className="pl-tablewrap"><table><thead><tr><th>Workspace</th><th>Last 24 hours</th><th>Last hour</th><th>Pause</th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small style={{ display: "block" }}>{row.ownerEmail || row.slug}</small></td><td>{row.dayFinished} finished · {row.dayBad} failed · {row.dayComplaints} complaints</td><td>{row.hourFinished} finished · {row.hourBad} failed</td><td>{row.hold ? <><Badge status="Paused"/><small style={{ display: "block" }}>{row.reason}</small></> : "Open"}</td><td>{row.hold ? <button type="button" className="pl-linkbutton" disabled={busy === row.id} onClick={async () => { setBusy(row.id); try { await sendingApi.releaseHold(row.id); notify("Sending released. The next message from this workspace can leave."); await load(); } catch (err) { notify(err instanceof SendingError ? err.message : "Could not release this pause."); } finally { setBusy(""); } }}>Release</button> : null}</td></tr>)}</tbody></table>{!rows.length && !error && <div className="pl-empty"><strong>No recent sending.</strong><p>Workspaces with finished mail in the last day, or a pause, show up here.</p></div>}</div></section>
    <p className="pl-footnote">A pause starts at 3 spam complaints, a burst of 15 failures inside 20 finished messages in an hour, or 10% failures across 50 finished messages in a day. One test bounce does not pause a workspace. This page shows counts and the owner address. It does not show subjects or message bodies.</p>
  </>;
}

function ActivityChart({ days }: { days: SendingActivity[] }) {
  const total = days.reduce((sum, day) => sum + day.accepted + day.attention, 0);
  const max = Math.max(1, ...days.map((day) => day.accepted + day.attention));
  const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
  const marks = days.length ? [days[0], days[Math.floor(days.length / 3)], days[Math.floor((days.length * 2) / 3)], days[days.length - 1]] : [];
  return <section className="pl-panel"><div className="pl-panelhead"><div><h2>Email activity</h2><p>{total ? `Last ${days.length} days · UTC` : `No sends in the last ${days.length || 14} days`}</p></div><span className="pl-legend"><i/> Accepted <i/> Needs attention</span></div>{total ? <div className="pl-chart" aria-label={`Email volume for this workspace over the last ${days.length} days`}>{days.map((day) => { const sum = day.accepted + day.attention; const height = sum ? Math.max(8, Math.round((sum / max) * 100)) : 0; const attention = sum ? Math.round((day.attention / sum) * 100) : 0; return <div key={day.date} style={{ height: sum ? `${height}%` : "2px", opacity: sum ? 1 : 0.35 }} title={`${label(day.date)}: ${day.accepted} accepted, ${day.attention} need attention`}><span style={{ height: `${attention}%` }}/></div>; })}</div> : <div className="pl-empty"><strong>No email activity yet.</strong><p>Sends from this workspace show up here.</p></div>}{total ? <div className="pl-chartlabels">{[...new Set(marks.map((day) => label(day.date)))].map((item) => <span key={item}>{item}</span>)}</div> : null}</section>;
}

function Dashboard(p:DashProps){
 const location=useLocation(),navigate=useNavigate();const page=location.pathname.split('/')[2]||'overview';
 const [mobile,setMobile]=useState(false),[modal,setModal]=useState(''),[value,setValue]=useState(''),[error,setError]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('All statuses'),[selected,setSelected]=useState<Email|null>(null),[domainDetail,setDomainDetail]=useState(''),[scope,setScope]=useState('Send emails'),[savedTemplate,setSavedTemplate]=useState('Welcome aboard'),[sendHtml,setSendHtml]=useState<string|undefined>(),[sendText,setSendText]=useState<string|undefined>(),[activity,setActivity]=useState<SendingActivity[]>([]);
 const [webhookEvent,setWebhookEvent]=useState('No test events yet'),[setupStep,setSetupStep]=useState(0),[workspaceName,setWorkspaceName]=useState('');
 const [slug,setSlug]=useState(''),[accountEmail,setAccountEmail]=useState(''),[accountStatus,setAccountStatus]=useState(''),[loadError,setLoadError]=useState('');
 const [members,setMembers]=useState<{name:string;email:string;role:string}[]>([]),[pendingInvites,setPendingInvites]=useState<{email:string;role:string;status:string}[]>([]),[notes,setNotes]=useState<{title:string;body:string;actionUrl?:string|null}[]>([]),[mailTemplates,setMailTemplates]=useState<MailTemplate[]>([]);
 const [connected,setConnected]=useState(false),[live,setLive]=useState(false),[accountName,setAccountName]=useState(''),[records,setRecords]=useState<SendingRecord[]>([]);
 const [dnsChecks,setDnsChecks]=useState<Record<string,{status?:string;detectedValue?:string|null}>>({}),[dnsBusy,setDnsBusy]=useState(false);
 const [dnsHost,setDnsHost]=useState<DomainHost>(),[applyBusy,setApplyBusy]=useState(false),[autoApply,setAutoApply]=useState(false);
 const [plan,setPlan]=useState<SendingPlan>(defaultPlan),[limits,setLimits]=useState<SendingLimits>(defaultLimits),[usage,setUsage]=useState<SendingUsage>({domains:0,emailsToday:0,emailsMonth:0,apiKeys:0,webhooks:0}),[billingManage,setBillingManage]=useState(false),[sendingHold,setSendingHold]=useState<string|null>(null),[operator,setOperator]=useState(false); const [searchParams]=useSearchParams();
 useEffect(()=>{setMobile(false);setSelected(null);setQuery('');setFilter('All statuses');if(!new URLSearchParams(location.search).get('domain'))setDomainDetail('');},[page]);
 useEffect(()=>{sendingApi.workspace().then(w=>{setConnected(true);setLive(w.live);p.setEmails(w.emails);p.setDomains(w.domains);p.setKeys(w.keys);p.setHooks(w.hooks);p.setSuppressions(w.suppressions);setWorkspaceName(w.workspace.name);setSlug(w.workspace.slug);setAccountName(w.user.name);setAccountEmail(w.user.email);setAccountStatus(w.user.accountStatus);setPlan(w.plan);setLimits(w.limits);setBillingManage(Boolean(w.billing?.manage));setSendingHold(w.workspace.sendingHold||null);setOperator(Boolean(w.operator));setUsage(w.usage);setMembers(w.members||[]);setPendingInvites(w.invitations||[]);setNotes(w.notifications||[]);setMailTemplates(w.templates||[]);setActivity(w.activity||[]);const welcome=w.templates?.find(item=>item.name==='Welcome aboard');if(welcome)setSavedTemplate(welcome.subject);}).catch(err=>{if(err instanceof SendingError&&err.status===401){navigate('/login');return;}setLoadError(err instanceof Error?err.message:'Could not load this workspace.');});},[]); useEffect(()=>{const checkout=searchParams.get('checkout'); if(checkout==='cancel') p.notify('Checkout cancelled. The plan was not changed.'); if(checkout!=='success') return; p.notify('Payment submitted. Limits update when Stripe confirms the subscription.'); const timer=window.setTimeout(()=>{sendingApi.workspace().then(w=>{setPlan(w.plan);setLimits(w.limits);setBillingManage(Boolean(w.billing?.manage));}).catch(()=>undefined);},1500); return ()=>window.clearTimeout(timer);},[searchParams]);
 useEffect(()=>{
  const q=new URLSearchParams(location.search);
  const name=q.get('domain');
  const cf=q.get('cf');
  if(name) setDomainDetail(name);
  if(cf==='connected') setAutoApply(true);
  if(cf==='failed'||cf==='setup') p.notify('Cloudflare authorization did not complete. Open Authorize Cloudflare again.');
 },[location.search]);
 useEffect(()=>{if(!domainDetail||!connected)return;sendingApi.domain(domainDetail).then(d=>{setRecords(d.records);setDnsChecks(d.lastCheck?.checks||{});setDnsHost(d.host);}).catch(()=>undefined);},[domainDetail,connected]);
 useEffect(()=>{if(!autoApply||!domainDetail||!connected)return;setAutoApply(false);setApplyBusy(true);sendingApi.verifyDomain(domainDetail).then(checked=>{p.setDomains(p.domains.map(d=>d.name===domainDetail?{...d,status:checked.status}:d));setRecords(checked.records);setDnsChecks(checked.checks||{});setDnsHost(h=>h?{...h,canApply:true}:h);p.notify(checked.status==='Verified'?'Cloudflare added the sending records.':'Cloudflare authorized the records. Check DNS if a row is still waiting.');}).catch(err=>p.notify(err instanceof SendingError?err.message:'Could not check DNS after Cloudflare authorization.')).finally(()=>setApplyBusy(false));},[autoApply,domainDetail,connected]);
 function open(name:string){setValue('');setError('');setModal(name);}
 async function submit(e:React.FormEvent){e.preventDefault();setError('');
 try{
 if(modal==='Add domain'){const v=value.trim().toLowerCase();if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(v)){setError('Enter a domain such as send.yourcompany.com, without https://.');return;}if(!connected&&p.domains.length>=limits.domains){setError(`${plan.label} includes ${limits.domains} sending domains.`);return;}if(connected){const added=await sendingApi.addDomain(v);p.setDomains([...p.domains,{name:added.name,status:added.status,host:added.host?.label,provider:added.host?.provider,nameservers:added.host?.nameservers}]);setUsage({...usage,domains:usage.domains+1});setRecords(added.records);setDnsChecks({});setDnsHost(added.host);setDomainDetail(added.name);}else{if(p.domains.some(d=>d.name===v)){setError('This domain is already in your workspace.');return;}p.setDomains([...p.domains,{name:v,status:'Pending'}]);setRecords([]);setDnsChecks({});setDomainDetail(v);}}
 else if(modal==='Create API key'){if(!value.trim()){setError('Give this key a name.');return;}if(!connected){setError('Sign in to create an API key.');return;}if(p.keys.length>=limits.apiKeys){setError(`${plan.label} includes ${limits.apiKeys} API keys.`);return;}const key=await sendingApi.createKey(value,scope);p.setKeys([...p.keys,{name:key.name,scope:key.scope,tail:key.tail}]);setUsage({...usage,apiKeys:usage.apiKeys+1});setModal('API key created');sessionStorage.setItem('postlane.key',key.secret);return;}
 else if(modal==='Add endpoint'){try{if(new URL(value).protocol!=='https:')throw Error();}catch{setError('Use a valid HTTPS endpoint.');return;}if(p.hooks.some(h=>h.url===value)){setError('This endpoint already exists.');return;}if(!connected&&p.hooks.length>=limits.webhooks){setError(`${plan.label} includes ${limits.webhooks} webhook endpoint${limits.webhooks===1?'':'s'}.`);return;}if(connected){const hook=await sendingApi.addWebhook(value);p.setHooks([...p.hooks,hook]);setUsage({...usage,webhooks:usage.webhooks+1});}else p.setHooks([...p.hooks,{url:value,status:'Active'}]);}
 else if(modal==='Add suppression'||modal==='Invite teammate'){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)){setError('Enter a valid email address.');return;}if(modal==='Add suppression'){if(p.suppressions.includes(value)){setError('This address is already suppressed.');return;}if(connected)await sendingApi.addSuppression(value);p.setSuppressions([...p.suppressions,value]);}else{if(!connected||!slug){setError('Sign in to invite a teammate.');return;}if(!limits.teamRoles){setError('Team roles ship with Scale. Sandbox and Launch stay owner-only.');return;}const invited=await sendingApi.invite(slug,value);setPendingInvites([...pendingInvites,{email:value,role:'developer',status:'pending'}]);p.notify(invited.message||'Invitation sent.');setModal('');return;}}
 else if(modal==='Send test email'){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)){setError('Enter a valid recipient address.');return;}if(!connected){setError('Sign in to send from this workspace.');return;}if(!p.keys.length||!p.domains.some(d=>d.status==='Verified')){setError('Verify a domain and create an API key before testing.');return;}const sent=await sendingApi.send({to:value,subject:savedTemplate,html:sendHtml,text:sendText});const status=sent.status==='rejected'?'Rejected':sent.status==='failed'?'Failed':sent.status==='queued'?'Queued':'Accepted';p.setEmails([{id:sent.id,to:value,subject:savedTemplate,status,time:'Just now',detail:status==='Failed'?'The provider did not accept the message.':null},...p.emails]);setActivity(days=>days.length?days.map((day,index)=>index===days.length-1?{...day,accepted:day.accepted+(status==='Failed'||status==='Rejected'?0:1),attention:day.attention+(status==='Failed'||status==='Rejected'?1:0)}:day):days);if(status!=='Rejected')setUsage(u=>({...u,emailsToday:u.emailsToday+1,emailsMonth:u.emailsMonth+1}));navigate('/app/emails');setModal('');p.notify(sent.message||'Send accepted. Delivery is a later event.');return;}
 setModal('');p.notify(connected?'Saved to your workspace.':'Sign in to save these changes.');
 }catch(err){setError(err instanceof SendingError?err.message:'Something went wrong.');}}
 const rows=p.emails.filter(e=>(e.to+' '+e.subject).toLowerCase().includes(query.toLowerCase())&&(filter==='All statuses'||e.status===filter));
 const copy=async(text:string)=>{try{await navigator.clipboard.writeText(text);p.notify('Copied to clipboard.');}catch{p.notify('Clipboard unavailable. Select and copy the visible text.');}};
 return <div className="pl-dashboard"><aside className={`pl-sidebar ${mobile?'open':''}`}><Brand/><div className="pl-workspace"><span className="pl-avatar">{workspaceName.slice(0,1)}</span><div><strong>{workspaceName}</strong><small>{connected?(live?'Sending workspace':'Local sending workspace'):'Loading workspace'}</small></div><span>⌄</span></div>{navGroups.map(([group, items]) => <div key={group}><p className="pl-navlabel">{group}</p><nav aria-label={group}>{items.map(([path,label,icon]) => <NavLink key={path} to={`/app/${path}`} className={({isActive}) => (isActive || (path === "overview" && page === "overview") ? "active" : "")}><Glyph name={icon}/>{label}{path === "emails" && <small>{p.emails.length}</small>}</NavLink>)}</nav></div>)}{operator&&<div><p className="pl-navlabel">Postlane</p><nav aria-label="Postlane"><NavLink to="/app/operations" className={({isActive}) => (isActive ? "active" : "")}><Glyph name="chart"/>Operations</NavLink></nav></div>}<div className="pl-sidebarbottom"><Link to="/docs">Documentation</Link><Link to="/app/support">Help & support</Link><div className="pl-profile"><span className="pl-avatar">{accountName.slice(0,1)}</span><div><strong>{accountName}</strong><small>{connected?'Signed in':'Sign in'}</small></div>{connected?<button type="button" className="pl-linkbutton" onClick={async()=>{await sendingApi.logout();navigate('/login');}}>Sign out</button>:<Link to="/login">Sign in</Link>}</div></div></aside><div className="pl-dashmain"><header className="pl-topbar"><div><button className="pl-mobiletoggle" onClick={()=>setMobile(!mobile)} aria-label="Toggle navigation">☰</button><span>Workspace</span><span>/</span><strong>{page==='operations'?'Operations':(nav.find(n=>n[0]===page)?.[1]||'Getting started')}</strong></div><div><span className="pl-sandbox"><span/> {connected?(live?'Live sending':'Local sending'):'Sandbox'}</span><Link className="pl-iconbtn" to="/app/notifications" aria-label="Notifications"><Glyph name="bell"/></Link><span className="pl-avatar tiny">{accountName.slice(0,1)}</span></div></header><div className="pl-previewbar"><span>{connected?'SENDING API':'WORKSPACE'}</span> {connected?(live?'Accepted sends go to the configured email provider. Delivered means the provider accepted the message, not inbox placement.':'Local provider: requests are stored. No message leaves this machine unless Email Sending is bound.'):'Sign in to load this workspace.'}<Link to="/docs">View the API</Link></div><main className="pl-dashcontent">{!connected&&<div className="pl-empty"><strong>{loadError||'Loading your workspace…'}</strong>{loadError?<p><Link to="/login">Sign in</Link></p>:null}</div>}{connected&&accountStatus==='unverified'&&<div className="pl-notice">Verify {accountEmail} before adding a domain or sending. <button type="button" className="pl-linkbutton" onClick={async()=>{try{const res=await sendingApi.resendVerification(accountEmail);if(res.url)navigate(res.url);else p.notify(res.message);}catch(err){p.notify(err instanceof SendingError?err.message:'Could not send a new link.');}}}>Send a new link</button></div>}
 {connected&&page==='overview'&&<><Head eyebrow="YOUR EMAIL, AT A GLANCE" title={accountName?`Good morning, ${accountName.split(' ')[0]}`:'Good morning'} description="A little clarity for everything you send." action={<Button onClick={()=>{setSendHtml(undefined);setSendText(undefined);open('Send test email');}}>Send a test email</Button>}/>{sendingHold&&<div className="pl-notice">{sendingHold}</div>}<div className="pl-onboarding"><div><div><h3>A good first impression starts here.</h3><p>Finish the setup and follow your first email from request to delivery.</p></div></div><Link to="/app/setup" className="pl-btn pl-secondary">Continue setup →</Link></div><div className="pl-stats">{[['Recent emails',String(p.emails.length),'Stored for this workspace'],['Sent',String(p.emails.filter(e=>['Accepted','Queued','Delivered'].includes(e.status)).length),'Queued or delivered by Cloudflare'],['Needs attention',String(p.emails.filter(e=>['Bounced','Deferred','Rejected','Failed','Complained'].includes(e.status)).length),'Review email events'],['Sending domains',String(p.domains.filter(d=>d.status==='Verified').length),'Verified domains']].map(([t,n,s])=><article key={t}><p>{t}</p><strong>{n}</strong><small>{s}</small></article>)}</div><ActivityChart days={activity}/><section className="pl-panel"><div className="pl-panelhead"><h2>Recent emails</h2><Link to="/app/emails">View all emails →</Link></div><EmailTable emails={p.emails.slice(0,4)} select={e=>{navigate('/app/emails');setTimeout(()=>setSelected(e),0);}}/></section><div className="pl-bottomcards"><article><span><Glyph name="key"/></span><h3>Build something good.</h3><p>A small request. A meaningful moment in your product.</p><Link to="/docs">Open the quickstart →</Link></article><article><span><Glyph name="globe"/></span><h3>Your domain needs attention.</h3><p>Check pending DNS records before sending from a new domain.</p><Link to="/app/domains">Review domains →</Link></article></div></>}
 {connected&&page==='emails'&&<><Head title="Emails" description="Every request has a story. Follow it here." action={<Button onClick={()=>{setSendHtml(undefined);setSendText(undefined);open('Send test email');}}>Send test email</Button>}/>{sendingHold&&<div className="pl-notice">{sendingHold}</div>}<div className="pl-toolbar"><input aria-label="Search emails" placeholder="Search recipient or subject…" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Filter delivery status" value={filter} onChange={e=>setFilter(e.target.value)}>{['All statuses','Queued','Delivered','Deferred','Bounced','Failed','Complained','Rejected','Accepted'].map(s=><option key={s}>{s}</option>)}</select></div><section className="pl-panel"><EmailTable emails={rows} select={setSelected}/></section><p className="pl-footnote">Delivered means accepted by the receiving server. {plan.label} keeps {limits.eventRetentionDays} days of event history.</p></>}
 {connected&&page==='domains'&&<><Head title="Domains" description="Make every message unmistakably yours." action={<Button onClick={()=>open('Add domain')}>+ Add domain</Button>}/><div className="pl-notice">{plan.label} includes {limits.domains} sending domains. You have {connected?usage.domains:p.domains.length}. We show the DNS host for each domain. Cloudflare zones can authorize Postlane to add records.</div><section className="pl-panel">{!p.domains.length?<div className="pl-empty"><strong>No sending domains yet.</strong><p>Add one to get the DNS records.</p></div>:p.domains.map(d=><div className="pl-listrow" key={d.name}><button className="pl-emailbutton" onClick={()=>setDomainDetail(d.name)}><span className="pl-featureicon"><Glyph name="globe"/></span><div><strong>{d.name}</strong><small>{d.host?`DNS host · ${d.host}`:'Sending domain · DNS configuration'}</small></div></button><Badge status={d.status}/><button type="button" className="pl-linkbutton" onClick={()=>open(`Remove domain:${d.name}`)}>Remove</button></div>)}</section></>}
 {connected&&page==='api-keys'&&<><Head title="API keys" description="The right access for every environment." action={<Button onClick={()=>open('Create API key')}>+ Create API key</Button>}/><div className="pl-notice">{plan.label} includes {limits.apiKeys} API keys. Keep secrets on your server. The value is shown once. POST /v1/emails uses Authorization: Bearer.</div><section className="pl-panel"><div className="pl-tablewrap"><table><thead><tr><th>Name</th><th>Permission</th><th>Key</th><th>Action</th></tr></thead><tbody>{p.keys.map((k,i)=><tr key={i}><td><strong>{k.name}</strong></td><td>{k.scope}</td><td><code>pl_live_•••• {k.tail}</code></td><td><button className="pl-linkbutton" onClick={()=>open(`Revoke key:${k.tail}`)}>Revoke</button></td></tr>)}</tbody></table>{!p.keys.length&&<div className="pl-empty"><strong>No keys yet.</strong><p>Create a scoped key to start testing.</p></div>}</div></section></>}
 {connected&&page==='templates'&&<TemplateEditor templates={mailTemplates} setTemplates={setMailTemplates} notify={p.notify} onTest={(rendered)=>{setSavedTemplate(rendered.subject);setSendHtml(rendered.html);setSendText(rendered.text);open('Send test email');}}/>}
 {connected&&page==='webhooks'&&<><Head title="Webhooks" description="Bring delivery events back into your application." action={<Button onClick={()=>open('Add endpoint')}>+ Add endpoint</Button>}/><div className="pl-notice">{plan.label} includes {limits.webhooks} webhook endpoint{limits.webhooks===1?'':'s'}.</div><section className="pl-panel">{p.hooks.map(h=><div className="pl-listrow" key={h.id||h.url}><span className="pl-featureicon"><Glyph name="zap"/></span><div><strong>{h.url}</strong><small>email.delivered · email.bounced · email.failed</small></div><Badge status={h.status}/>{h.id&&<button type="button" className="pl-linkbutton" onClick={async()=>{setWebhookEvent('Sending a test event…');try{const res=await sendingApi.testWebhook(h.id!);setWebhookEvent(`${res.status} · ${res.ok?'The endpoint accepted the test event.':'The endpoint responded, but not with success.'}`);}catch(err){setWebhookEvent(err instanceof SendingError?err.message:'The endpoint did not accept the test event.');}}}>Test</button>}{h.id&&<button type="button" className="pl-linkbutton" onClick={()=>open(`Remove webhook:${h.id}`)}>Remove</button>}</div>)}{!p.hooks.length&&<div className="pl-empty"><strong>No endpoints yet.</strong><p>Add an HTTPS URL to receive delivery events.</p></div>}</section><section className="pl-panel pl-editor"><h2>Test an endpoint</h2><p>Test posts a sample email.delivered event to that saved HTTPS URL. Private and local addresses are refused.</p><pre className="pl-lightcode">{webhookEvent}</pre></section></>}
 {connected&&page==='suppressions'&&<><Head title="Suppressions" description="Respect recipient preferences and protect your sender reputation." action={<Button onClick={()=>open('Add suppression')}>+ Add suppression</Button>}/><section className="pl-panel">{p.suppressions.map(s=><div className="pl-listrow" key={s}><div><strong>{s}</strong><small>Sending to this address is blocked.</small></div><button className="pl-linkbutton" onClick={()=>open(`Remove suppression:${s}`)}>Remove</button></div>)}{!p.suppressions.length&&<div className="pl-empty"><strong>No suppressed recipients.</strong><p>Bounces and complaints will appear here.</p></div>}</section></>}
 {connected&&page==='usage'&&<><Head title="Usage & billing" description="Know what you’re using before the next invoice."/><div className="pl-notice">{connected?(plan.requested!==plan.entitled?`${PLAN_CATALOG[normalizePlan(plan.requested)].label} is waiting for Stripe. ${plan.label} limits still apply.`:`You are on ${plan.label}. ${plan.entitled==='sandbox'?'Subscribe to Launch or Scale to raise these limits.':'Stripe bills this workspace monthly.'}`):'Sign in to see this workspace.'}</div><div className="pl-stats"><article><p>Current plan</p><strong>{plan.label}</strong><small>{connected?(plan.status==='active'?'Active':'Waiting for Stripe'):'Sign in'}</small></article><article><p>Emails today</p><strong>{connected?usage.emailsToday:p.emails.length}</strong><small>{limits.emailsPerDay==null?'No daily cap':`${limits.emailsPerDay} / UTC day`}</small></article><article><p>Emails this month</p><strong>{connected?usage.emailsMonth:p.emails.length}</strong><small>{limits.emailsPerMonth.toLocaleString()} / month</small></article><article><p>Domains</p><strong>{connected?usage.domains:p.domains.length}</strong><small>{limits.domains} on this plan</small></article></div><div className="pl-usagegrid"><article><p>API keys</p><strong>{connected?usage.apiKeys:p.keys.length} / {limits.apiKeys}</strong><div className="pl-usagebar"><span style={{width:`${Math.min(100,((connected?usage.apiKeys:p.keys.length)/limits.apiKeys)*100)}%`}}/></div></article><article><p>Webhooks</p><strong>{connected?usage.webhooks:p.hooks.length} / {limits.webhooks}</strong><div className="pl-usagebar"><span style={{width:`${Math.min(100,((connected?usage.webhooks:p.hooks.length)/limits.webhooks)*100)}%`}}/></div></article><article><p>Rate limit</p><strong>{limits.rateLimitPerSecond} / sec</strong><small>Per workspace, not per key</small></article><article><p>Event history</p><strong>{limits.eventRetentionDays} days</strong><small>Older events are not listed</small></article></div><PlanCards current={plan.entitled} status={plan.status} onChoose={async(id)=>{try{if(!connected){p.notify('Sign in to change the workspace plan.');return;}const res=await sendingApi.selectPlan(id);if(res.url){window.location.href=res.url;return;}const next=PLAN_CATALOG[normalizePlan(res.entitled)];setPlan({id:res.entitled,label:next.label,requested:res.plan,status:res.status,entitled:res.entitled});setLimits({domains:next.domainLimit,emailsPerDay:next.emailsPerDay,emailsPerMonth:next.emailsPerMonth,apiKeys:next.apiKeyLimit,webhooks:next.webhookLimit,eventRetentionDays:next.eventRetentionDays,rateLimitPerSecond:next.rateLimitPerSecond,teamRoles:next.teamRoles});p.notify(res.message);}catch(err){p.notify(err instanceof SendingError?err.message:'Could not update the plan.');}}}/>{billingManage&&<div className="pl-actions"><Button secondary onClick={async()=>{try{const portal=await sendingApi.billingPortal();window.location.href=portal.url;}catch(err){p.notify(err instanceof SendingError?err.message:'Could not open Stripe billing.');}}}>Manage billing</Button></div>}<section className="pl-panel pl-editor"><h2>How usage is counted</h2><p className="pl-footnote">Each To, CC, and BCC address counts as one email. Rejected addresses are not counted. A message can include 50 recipients. Cloudflare can reject the send when its account quota is reached, even if this workspace still has allowance.</p></section></>}
 {connected&&page==='team'&&<><Head title="Team" description="Build together. Keep access intentional." action={<Button onClick={()=>open('Invite teammate')}>+ Invite teammate</Button>}/><div className="pl-notice">{limits.teamRoles?'Owner, admin, developer, and billing roles are available on this plan.':'Team roles ship with Scale. Sandbox and Launch stay owner-only until you upgrade.'}</div><section className="pl-panel">{(members.length?members:[{name:accountName||'You',email:accountEmail,role:'owner'}]).map(m=><div className="pl-listrow" key={m.email}><span className="pl-avatar">{(m.name||'?').slice(0,1)}</span><div><strong>{m.name}</strong><small>{m.email}</small></div><Badge status={m.role.charAt(0).toUpperCase()+m.role.slice(1)}/></div>)}{pendingInvites.map(i=><div className="pl-listrow" key={i.email}><div><strong>{i.email}</strong><small>{i.role.charAt(0).toUpperCase()+i.role.slice(1)} · invitation sent</small></div><Badge status="Pending"/></div>)}</section><p className="pl-footnote">Proposed roles: Owner manages billing and access; Developer manages sending; Viewer inspects activity.</p></>}
 {connected&&page==='settings'&&<><Head title="Settings" description="A workspace that works the way you do."/><section className="pl-panel pl-editor"><h2>Workspace details</h2><form onSubmit={async e=>{e.preventDefault();if(connected)await sendingApi.rename(workspaceName);p.notify(connected?'Workspace name saved.':'Sign in to rename this workspace.');}}><label>Workspace name<input required value={workspaceName} onChange={e=>setWorkspaceName(e.target.value)}/></label><label>Environment<input value={connected?(live?'Production sending':'Local sending'):'Sign in'} readOnly/></label><Button type="submit">Save changes</Button></form></section><section className="pl-panel pl-editor"><h2>Security & access</h2><p>Verified accounts and hashed API keys are in place. Multi-factor authentication, session revocation, and a full audit trail are still planned.</p><Link to="/security">Read the security implementation scope →</Link></section></>}
 {connected&&page==='setup'&&<><Head eyebrow="FROM ZERO TO FIRST SEND" title="Let’s get your email moving." description="Connect a domain, create a key, and send a test."/><div className="pl-setupgrid"><div className="pl-setupsteps">{['Create your workspace','Verify your domain','Create an API key','Send a test email'].map((s,i)=><button className={setupStep===i?'active':''} key={s} onClick={()=>setSetupStep(i)}><span>{i+1}</span>{s}</button>)}</div><section className="pl-panel pl-editor">{setupStep===0?<><h2>A home for your application email.</h2><label>Workspace name<input value={workspaceName} onChange={e=>setWorkspaceName(e.target.value)}/></label><Button onClick={()=>setSetupStep(1)}>Continue →</Button></>:setupStep===1?<><h2>Send from your own domain.</h2><p>Add a subdomain, then publish the DNS records we show and check them.</p><Button onClick={()=>{navigate('/app/domains');open('Add domain');}}>Add sending domain →</Button><Link className="pl-blocklink" to="/app/domains">Review existing domains</Link></>:setupStep===2?<><h2>Connect your application.</h2><p>Create a server-side sending key with the smallest permission set your app needs.</p><Button onClick={()=>{navigate('/app/api-keys');open('Create API key');}}>Create API key →</Button></>:<><h2>The first send is a good feeling.</h2><p>Choose a sample delivery outcome, then inspect the event timeline.</p><Button onClick={()=>{setSendHtml(undefined);setSendText(undefined);open('Send test email');}}>Send test email</Button></>}</section></div></>}
 {connected&&page==='notifications'&&<><Head title="Notifications" description="The things worth your attention."/><section className="pl-panel">{notes.length?notes.map(n=><Link className="pl-listrow" to={n.actionUrl||'/app'} key={n.title+n.body}><div><strong>{n.title}</strong><small>{n.body}</small></div><span>→</span></Link>):<div className="pl-empty"><strong>Nothing needs attention.</strong><p>Domain and send notices show up here.</p></div>}</section></>}
 {connected&&page==='support'&&<><Head title="How can we help?" description="Find the next step without sharing your secrets."/><div className="pl-bottomcards"><article><h3>Domain not verifying?</h3><p>Compare expected and detected records, check the hostname, then retry after DNS propagation.</p><Link to="/app/domains">Review DNS →</Link></article><article><h3>Email not arriving?</h3><p>Inspect the latest event. Accepted, deferred, bounced, and delivered each need a different response.</p><Link to="/app/emails">Inspect email events →</Link></article></div><Link className="pl-btn pl-secondary" to="/contact">Contact options →</Link></>}
 {connected&&page==='operations'&&(operator?<OperationsPanel notify={p.notify}/>:<div className="pl-empty"><strong>This account cannot view operations.</strong><p><Link to="/app">Return to overview →</Link></p></div>)}
 {connected&&!['overview','emails','domains','api-keys','templates','webhooks','suppressions','usage','team','settings','setup','notifications','support','operations'].includes(page)&&<div className="pl-empty"><h1>Page not found</h1><Link to="/app">Return to overview →</Link></div>}
 </main></div>
 {selected&&<Modal title="Email details" close={()=>setSelected(null)}><Badge status={selected.status}/><h3>{selected.subject}</h3><dl className="pl-detail"><dt>Recipient</dt><dd>{selected.to}</dd><dt>Message ID</dt><dd>{selected.id}</dd><dt>Environment</dt><dd>{live?'Live sending':'Your workspace'}</dd></dl><div className="pl-timeline"><div><span/>Request stored<small>{selected.time}</small></div><div><span/>{selected.status}<small>{statusNote(selected.status, selected.detail)}</small></div></div><Button secondary onClick={()=>copy(selected.id)}>Copy message ID</Button></Modal>}
 {domainDetail&&<Modal wide title={`DNS for ${domainDetail}`} close={()=>setDomainDetail('')}>
  <DnsGuide domain={domainDetail} records={records} checks={dnsChecks} copy={copy} host={dnsHost} applying={applyBusy} checking={dnsBusy} onShowToken={async()=>{
    setApplyBusy(true);
    try{
      if(!connected){p.notify("Sign in to authorize DNS changes.");return;}
      const dc=await sendingApi.domainConnect(domainDetail);
      if(!dc.url) throw new SendingError("Could not open Cloudflare.");
      const win=window.open(dc.url,"postlane-cloudflare","width=1100,height=820");
      if(!win){window.location.assign(dc.url);return;}
      p.notify("Review the records in Cloudflare, then click Authorize.");
      const result=await waitForDomainConnect();
      if(!result.ok){p.notify(result.error?`Cloudflare authorization did not complete. ${result.error}`:"Cloudflare authorization did not complete.");return;}
      const checked=await sendingApi.verifyDomain(domainDetail);
      p.setDomains(p.domains.map(d=>d.name===domainDetail?{...d,status:checked.status}:d));
      setRecords(checked.records);setDnsChecks(checked.checks||{});
      setDnsHost((h)=>h?{...h,canApply:true,connected:true}:h);
      p.notify(checked.status==='Verified'?'Cloudflare added the sending records.':'Cloudflare authorized the ownership record. Check DNS if a row is still waiting.');
    }catch(err){p.notify(err instanceof SendingError?err.message:'Could not add records in Cloudflare.');}
    finally{setApplyBusy(false);}
  }} onApply={async()=>{
    setApplyBusy(true);
    try{
      const res=await sendingApi.applyDns(domainDetail);
      p.notify(res.message);
      const checked=await sendingApi.verifyDomain(domainDetail);
      p.setDomains(p.domains.map(d=>d.name===domainDetail?{...d,status:checked.status}:d));
      setRecords(checked.records);setDnsChecks(checked.checks||{});
      setDnsHost((h)=>h?{...h,canApply:true,connected:true}:h);
    }catch(err){p.notify(err instanceof SendingError?err.message:'Could not add records in Cloudflare.');}
    finally{setApplyBusy(false);}
  }}/>
  <Badge status={p.domains.find(d=>d.name===domainDetail)?.status||'Pending'}/>
  <div className="pl-actions"><Button disabled={dnsBusy} onClick={async()=>{if(connected){setDnsBusy(true);try{const res=await sendingApi.verifyDomain(domainDetail);p.setDomains(p.domains.map(d=>d.name===domainDetail?{...d,status:res.status}:d));setRecords(res.records);setDnsChecks(res.checks||{});p.notify(res.status==='Verified'?'All required records look correct. You can send from this domain.':'Still waiting on one or more records. DNS can take a few minutes — copy again if a row says Not found, then retry.');}catch(err){p.notify(err instanceof SendingError?err.message:'Could not check DNS.');}finally{setDnsBusy(false);}}}}>{dnsBusy?'Checking DNS…':'Check DNS'}</Button></div>
  <Link className="pl-blocklink" to="/app/setup" onClick={()=>{setDomainDetail('');setSetupStep(2);}}>Continue to API keys</Link>
 </Modal>}
 {modal&&<Modal title={modal.split(':')[0]} close={()=>setModal('')}>{modal==='API key created'?<><p>Copy this secret now. It will not be shown again.</p><pre className="pl-lightcode">{sessionStorage.getItem('postlane.key')||''}</pre><Button onClick={()=>copy(sessionStorage.getItem('postlane.key')||'')}>Copy key</Button></>:modal.startsWith('Revoke key:')?<><p>Revocation immediately blocks new requests using this key.</p><Button onClick={async()=>{const tail=modal.slice('Revoke key:'.length);if(connected)await sendingApi.revokeKey(tail);p.setKeys(p.keys.filter(k=>k.tail!==tail));setUsage(u=>({...u,apiKeys:Math.max(0,u.apiKeys-1)}));setModal('');p.notify('Key revoked.');}}>Revoke key</Button></>:modal.startsWith('Remove domain:')?<><p>Removing this domain stops new sends from it. Existing activity stays in the log.</p><Button onClick={async()=>{const name=modal.slice('Remove domain:'.length);try{await sendingApi.deleteDomain(name);p.setDomains(p.domains.filter(d=>d.name!==name));setUsage(u=>({...u,domains:Math.max(0,u.domains-1)}));if(domainDetail===name)setDomainDetail('');setModal('');p.notify('Domain removed.');}catch(err){p.notify(err instanceof SendingError?err.message:'Could not remove that domain.');}}}>Remove domain</Button></>:modal.startsWith('Remove webhook:')?<><p>This endpoint will stop receiving delivery events.</p><Button onClick={async()=>{const id=modal.slice('Remove webhook:'.length);try{await sendingApi.deleteWebhook(id);p.setHooks(p.hooks.filter(h=>h.id!==id));setUsage(u=>({...u,webhooks:Math.max(0,u.webhooks-1)}));setModal('');p.notify('Endpoint removed.');}catch(err){p.notify(err instanceof SendingError?err.message:'Could not remove that endpoint.');}}}>Remove endpoint</Button></>:modal.startsWith('Remove suppression:')?<><p>Only remove a suppression after investigating its reason.</p><Button onClick={async()=>{const email=modal.slice('Remove suppression:'.length);if(connected)await sendingApi.removeSuppression(email);p.setSuppressions(p.suppressions.filter(s=>s!==email));setModal('');}}>Remove suppression</Button></>:<form onSubmit={submit}><p>{modal==='Add domain'?'Use your website domain or a sending subdomain. Next we show copy-ready Type, Host, and Value fields for your DNS provider.':modal==='Send test email'?(sendHtml?'Send this template to one address. Preview values such as Alex are already filled in.':'Send a test from a verified domain. Acceptance is not delivery.'):modal==='Invite teammate'?'We email a single-use invitation. Team roles require Scale.':'Enter the details for this change.'}</p><label>{modal==='Add domain'?'Sending domain':modal==='Create API key'?'Key name':modal==='Add endpoint'?'Endpoint URL':'Email address'}<input autoFocus required type={['Send test email','Add suppression','Invite teammate'].includes(modal)?'email':'text'} placeholder={modal==='Add domain'?'yourdomain.com or send.yourdomain.com':modal==='Create API key'?'Production app':modal==='Add endpoint'?'https://yourapp.com/webhooks/email':'alex@example.com'} value={value} onChange={e=>setValue(e.target.value)}/></label>{modal==='Create API key'&&<label>Permission<select value={scope} onChange={e=>setScope(e.target.value)}><option>Send emails</option><option>Read activity</option><option>Full access</option></select></label>}{error&&<p className="pl-error" role="alert">{error}</p>}<Button type="submit">{modal==='Send test email'?'Send test':modal==='Invite teammate'?'Send invitation':modal} →</Button></form>}</Modal>}
 </div>;
}
function EmailTable({emails,select}:{emails:Email[];select:(e:Email)=>void}){return <div className="pl-tablewrap"><table><thead><tr><th>Recipient / subject</th><th>Status</th><th>Sent</th><th/></tr></thead><tbody>{emails.map(e=><tr key={e.id}><td><button className="pl-emailbutton" onClick={()=>select(e)}><strong>{e.to}</strong><small>{e.subject}</small></button></td><td><Badge status={e.status}/></td><td>{e.time}</td><td><button className="pl-linkbutton" aria-label={`Inspect ${e.subject}`} onClick={()=>select(e)}>View</button></td></tr>)}</tbody></table>{!emails.length&&<div className="pl-empty"><strong>No emails match this view.</strong><p>Try a different search or send a test email.</p></div>}</div>;}
function PlanCards({onChoose,current,status}:{onChoose?:(id:string)=>void;current?:string;status?:string}={}){
  return <div className="pl-plans">{PLAN_IDS.map((id)=>{
    const spec=PLAN_CATALOG[id];
    const price=spec.priceCents===0?'$0':`$${spec.priceCents/100}`;
    return <article key={id} className={id==='launch'?'featured':''}>
      <p className="pl-eyebrow">{spec.label}</p>
      <h3>{spec.tagline}</h3>
      <strong className="pl-price">{price}<small> / month</small></strong>
      <p>{spec.blurb}</p>
      <ul>{spec.features.map((item)=><li key={item}>{item}</li>)}</ul>
      {onChoose
        ? <button type="button" className={`pl-btn ${id==='launch'?'':'pl-secondary'}`} disabled={current===id&&status==='active'} onClick={()=>onChoose(id)}>{current===id&&status==='active'?'Current plan':id==='sandbox'?'Use Sandbox':`Subscribe to ${spec.label}`}</button>
        : <Link className={`pl-btn ${id==='launch'?'':'pl-secondary'}`} to="/signup">{id==='sandbox'?'Start sending':`Subscribe to ${spec.label}`}</Link>}
    </article>;
  })}</div>;
}
function googleAuthError(code:string|null){
  if(code==='denied') return 'Google sign-in was cancelled.';
  if(code==='not_configured') return 'Google sign-in is not configured yet.';
  if(code==='unverified') return 'Google did not verify that email address.';
  if(code==='conflict') return 'This email is already linked to a different Google account. Sign in with email instead.';
  if(code) return 'Google sign-in failed. Try again.';
  return '';
}
function Auth({signup=false,reset=false}:{signup?:boolean;reset?:boolean}){
  const [params]=useSearchParams();
  const [done,setDone]=useState(false);const [busy,setBusy]=useState(false);
  const [error,setError]=useState(googleAuthError(params.get('auth_error')));
  const [name,setName]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const navigate=useNavigate();
  return <div className="pl-auth"><div className="pl-authstory"><Brand/><div><p className="pl-eyebrow">A CLEAR PATH FROM SEND TO DELIVERED</p><h1>Small requests.<br/>Meaningful<br/><em>connections.</em></h1><p>Build the emails your product deserves.</p></div><small>Postlane · Developer email platform</small></div><main className="pl-authform"><Link to="/" className="pl-back">Back to Postlane</Link><p className="pl-eyebrow">DEVELOPER EMAIL API</p><h1>{reset?'Reset your password':signup?'Your next good thing starts here.':'Welcome back.'}</h1><p>{reset?'If an account exists, you will get a reset path.':'Create a workspace, verify a sending domain, then send through the API.'}</p>{!reset&&<><a className="pl-google" href={`/api/auth/google?intent=${signup?'signup':'login'}`}><svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8c-.2 1.1-.9 2.1-1.8 2.7v2.3h3c1.8-1.6 2.8-4 2.8-6.6z"/><path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-3-2.3c-.8.6-1.9.9-3 .9-2.3 0-4.3-1.6-5-3.7H1v2.4C2.4 16.1 5.5 18 9 18z"/><path fill="#FBBC05" d="M4 10.7c-.2-.6-.3-1.2-.3-1.7S3.8 7.9 4 7.3V4.9H1C.4 6.2 0 7.6 0 9s.4 2.8 1 4.1l3-2.4z"/><path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3L14.7 3C13.1 1.5 11.1.6 9 .6 5.5.6 2.4 2.5 1 5.5l3 2.4C4.7 5.2 6.7 3.6 9 3.6z"/></svg>Continue with Google</a><div className="pl-or"><span>or</span></div></>}{done?<div className="pl-notice">If an account exists, a reset link is available. <Link to="/login">Back to sign in</Link></div>:<form onSubmit={async e=>{e.preventDefault();setError('');setBusy(true);try{if(reset){await sendingApi.forgot(email);setDone(true);}else if(signup){const res=await sendingApi.signup({name,email,password,consent:true});if(res.verification.url)navigate(`/verify-email?token=${encodeURIComponent(res.verification.url.split('token=')[1]||'')}`);else navigate(`/verify-email?email=${encodeURIComponent(email)}`);}else{await sendingApi.login({email,password});const next=params.get('next');navigate(next&&next.startsWith('/')&&!next.startsWith('//')?next:'/app/setup');}}catch(err){setError(err instanceof SendingError?err.message:'Something went wrong.');}finally{setBusy(false);}}}>{signup&&<label>Your name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Jamie Davis" autoComplete="name"/></label>}<label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="jamie@example.com" autoComplete="email"/></label>{!reset&&<label>Password<input type="password" required minLength={12} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 12 characters" autoComplete={signup?'new-password':'current-password'}/></label>}{error&&<p className="pl-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{reset?'Send reset link':signup?'Create account':'Sign in'}</Button></form>}{!reset&&<p className="pl-authlinks"><Link to={signup?'/login':'/signup'}>{signup?'Already have an account? Sign in':'New here? Create an account'}</Link><Link to="/forgot-password">Forgot password?</Link></p>}<small>By continuing, review the <Link to="/terms">draft terms</Link> and <Link to="/privacy">privacy scope</Link>.</small></main></div>;
}
function VerifyEmail(){
  const [params]=useSearchParams();const navigate=useNavigate();const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const [email,setEmail]=useState(params.get('email')||'');
  const token=params.get('token')||'';
  return <div className="pl-auth"><div className="pl-authstory"><Brand/><div><p className="pl-eyebrow">VERIFY YOUR ACCOUNT</p><h1>Confirm this<br/>address.</h1><p>Verification is required before you can add a sending domain.</p></div></div><main className="pl-authform"><Link to="/" className="pl-back">Back to Postlane</Link><h1>Check your inbox.</h1>{token?<><p>Use this single-use link to verify.</p>{error&&<p className="pl-error" role="alert">{error}</p>}<Button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await sendingApi.verify(token);navigate('/app/setup');}catch(err){setError(err instanceof SendingError?err.message:'This link is invalid or expired.');}finally{setBusy(false);}}}>Verify this address</Button></>:<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');setNotice('');try{const res=await sendingApi.resendVerification(email);if(res.url)navigate(res.url);else setNotice(res.message);}catch(err){setError(err instanceof SendingError?err.message:'Could not send a new link.');}finally{setBusy(false);}}}><p>Enter the address you used to sign up and we will send another verification link.</p><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label>{notice&&<div className="pl-notice">{notice}</div>}{error&&<p className="pl-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>Send a new link</Button></form>}</main></div>;
}
function ResetPassword(){
  const [params]=useSearchParams();const token=params.get('token')||'';
  const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [done,setDone]=useState(false);
  return <div className="pl-auth"><div className="pl-authstory"><Brand/><div><p className="pl-eyebrow">RESET PASSWORD</p><h1>Choose a new<br/>password.</h1><p>This link works once. Signing in again uses the new password.</p></div></div><main className="pl-authform"><Link to="/" className="pl-back">Back to Postlane</Link><h1>Set a new password.</h1>{done?<div className="pl-notice">Password updated. <Link to="/login">Sign in</Link></div>:!token?<p>This reset link is missing its token. <Link to="/forgot-password">Request a new one</Link>.</p>:<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await sendingApi.reset(token,password);setDone(true);}catch(err){setError(err instanceof SendingError?err.message:'This reset link is invalid or expired.');}finally{setBusy(false);}}}><label>New password<input type="password" required minLength={12} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 12 characters" autoComplete="new-password"/></label>{error&&<p className="pl-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>Save password</Button></form>}</main></div>;
}
function InvitationPage(){
  const {token=''}=useParams();const navigate=useNavigate();
  const [info,setInfo]=useState<{workspace:string;role:string;email:string}|null>(null);
  const [sessionEmail,setSessionEmail]=useState<string|null>(null);const [error,setError]=useState('');const [done,setDone]=useState(false);const [busy,setBusy]=useState(false);
  useEffect(()=>{sendingApi.invitation(token).then(setInfo).catch(err=>setError(err instanceof SendingError?err.message:'This invitation is no longer available.'));sendingApi.session().then(s=>setSessionEmail(s.user?.email??'')).catch(()=>setSessionEmail(''));},[token]);
  const next=`/invitations/${token}`;
  return <div className="pl-auth"><div className="pl-authstory"><Brand/><div><p className="pl-eyebrow">TEAM INVITATION</p><h1>Join a<br/>workspace.</h1></div></div><main className="pl-authform"><Link to="/" className="pl-back">Back to Postlane</Link>{error?<><h1>Invitation unavailable.</h1><p className="pl-error" role="alert">{error}</p></>:!info?<h1>Loading invitation…</h1>:done?<><h1>You’re in.</h1><p>You joined {info.workspace} as {info.role}.</p><Button onClick={()=>navigate('/app')}>Open the dashboard</Button></>:<><h1>Join {info.workspace}.</h1><p>This invitation is for {info.email} as {info.role}.</p>{sessionEmail===null?<p>Checking your session…</p>:sessionEmail.toLowerCase()===info.email.toLowerCase()?<Button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await sendingApi.acceptInvitation(token);setDone(true);}catch(err){setError(err instanceof SendingError?err.message:'Could not accept this invitation.');}finally{setBusy(false);}}}>Accept invitation</Button>:<><p>{sessionEmail?`You are signed in as ${sessionEmail}. Sign in with the invited address.`:'Sign in with the invited address to accept.'}</p><Link className="pl-btn" to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></>}</>}</main></div>;
}
function ContactForm(){
  const [name,setName]=useState('');const [email,setEmail]=useState('');const [message,setMessage]=useState('');const [website,setWebsite]=useState('');
  const [error,setError]=useState('');const [done,setDone]=useState(false);const [busy,setBusy]=useState(false);
  return <><Head eyebrow="CONTACT" title="Send a note." description="Your message goes to info@tmdspace.com. A reply uses the email address you enter."/>{done?<div className="pl-notice">Message sent from noreply@pdfzavi.com.</div>:<form className="pl-panel pl-editor" onSubmit={async e=>{e.preventDefault();setError('');setBusy(true);try{const res=await fetch('/api/contact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,email,message,website})});const data=await res.json().catch(()=>null);if(!res.ok)throw new Error(data?.message||'Could not send the message.');setDone(true);}catch(err){setError(err instanceof Error?err.message:'Could not send the message.');}finally{setBusy(false);}}}><label>Your name<input required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label><label>Your email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label><label>Message<textarea required minLength={5} maxLength={4000} rows={6} value={message} onChange={e=>setMessage(e.target.value)}/></label><label className="pl-honeypot">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e=>setWebsite(e.target.value)}/></label>{error&&<p className="pl-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy?'Sending…':'Send'}</Button></form>}</>;
}
function PublicPage(){const location=useLocation();const page=location.pathname.slice(1);const [copied,setCopied]=useState(false);const info:Record<string,[string,string,string[]]>={about:['Email should feel straightforward.','Postlane is a developer email platform in design and development.',['Our focus is transactional email: a clear API, guided domain setup, and understandable delivery events.','We are building an independent product experience. Postlane is not affiliated with Resend.']],security:['Trust starts with clear boundaries.','Security requirements for the production service.',['Hashed API keys, least-privilege scopes, and workspace isolation are in place. Encrypted provider credentials and a full audit trail are still planned.','Webhook signatures, replay protection, rate limits, abuse review, and safe HTML handling are release requirements.','This page is not evidence of a security certification or a completed production audit.']],status:['Service status','No live monitoring is connected yet.',['Production components to monitor: Email API, outbound delivery, webhook delivery, domain verification, and dashboard.','This page does not claim that production systems are operational.']],privacy:['Privacy notice — draft','The final policy must reflect the deployed service.',['Accounts, domains, API keys, and sends are stored for the signed-in workspace. This notice is still a draft and is not a finished privacy policy.','Before production: document account data, email content, retention, deletion, subprocessors, processing locations, and privacy contact details.']],terms:['Terms of service — draft','Commercial and legal terms are not finalized.',['Before launch, define the contracting entity, service scope, payment terms, acceptable use, suspension, termination, and applicable law.','Launch and Scale are billed monthly through Stripe. Sandbox stays free. Paid limits apply after Stripe confirms the subscription.','Outbound mail goes through Cloudflare Email Service. A message can have 50 recipients and 5 MiB. One zone can have 30 sending domains. Cloudflare’s daily quota is per account and can reject a send before the workspace reaches its own cap. The provider includes 3,000 emails per account each month, then bills further email to that account.']], 'acceptable-use':['Send with care.','Proposed acceptable-use principles.',['Use verified sender identities. Do not send unsolicited, deceptive, harmful, or impersonating messages.','This service is for transactional mail: welcome, verification, password reset, receipts, and similar product messages. Marketing and bulk campaigns are outside it.','Honor recipient preferences and suppressions. Investigate elevated complaints and bounces before increasing volume.','The production policy and enforcement procedures require final review.']],changelog:['A new lane for Postlane.','September 20, 2026 · Product direction',['Postlane is shifting from mailbox hosting to a transactional email platform for developers.','The product includes domain onboarding, scoped keys, email activity, templates, webhooks, suppressions, and usage controls.','Sending and DNS checks use the configured mail provider. Launch and Scale limits apply after Stripe confirms the subscription.']]};
return <div className="pl-public"><PublicHeader/><main className="pl-publicinner">{page==='pricing'?<><Head eyebrow="SIMPLE BY DESIGN" title="Room to build. Room to grow." description="Sandbox is free. Launch is $20. Scale is $60. Daily and monthly send caps are enforced in the API. Paid limits apply after Stripe confirms the subscription."/><PlanCards/><p className="pl-footnote">Each To, CC, and BCC address counts as one email. Daily caps reset at 00:00 UTC. A message can include 50 recipients and 5 MiB. Cloudflare can still reject a send when its account daily quota is reached. Launch and Scale are billed monthly through Stripe.</p></>:page==='docs'?<><Head eyebrow="DEVELOPER QUICKSTART" title="From idea to first send." description="POST /v1/emails on this origin. Verify a sending domain, create a key, and send from your server."/><div className="pl-docgrid"><aside><a href="#quickstart">01 · Quickstart</a><a href="#request">02 · Send an email</a><a href="#errors">03 · Handle errors</a><a href="#events">04 · Delivery events</a></aside><div><section id="quickstart"><h2>Make your first request</h2><p>Verify a sending domain, create a sending-only key, and call the API from your server. Keep the same idempotency key when retrying the same logical send.</p><Link to="/app/setup" className="pl-btn">Try the onboarding preview</Link></section><section id="request"><h2>POST /v1/emails</h2><button className="pl-linkbutton" onClick={async()=>{try{await navigator.clipboard.writeText(code);setCopied(true);}catch{setCopied(false);}}}>{copied?'Copied':'Copy example'}</button><pre className="pl-doccode">{code}</pre><p>Proposed response: <code>{'{ "id": "em_…", "status": "accepted" }'}</code>. A successful request confirms acceptance, not delivery.</p></section><section id="errors"><h2>Errors that tell you what to do</h2>{[['401 · Invalid API key','Check that the key is valid and has not been revoked.'],['403 · Sender not verified','Complete domain verification and check key scope.'],['422 · Invalid request','Correct the recipient, content, or attachment size.'],['429 · Rate limited','Respect Retry-After and retry with the same idempotency key.'],['503 · Provider unavailable','Retry with backoff; avoid creating duplicate sends.']].map(([t,d])=><div className="pl-docerror" key={t}><strong>{t}</strong><p>{d}</p></div>)}</section><section id="events"><h2>Follow the delivery lifecycle</h2><p>Proposed events: <code>email.accepted</code>, <code>email.delivered</code>, <code>email.deferred</code>, <code>email.bounced</code>, <code>email.failed</code>, and <code>email.complained</code>.</p><p>Verify webhook signatures and handle duplicate or out-of-order events. The backend must normalize the selected provider’s events and retain provider message IDs.</p><Link to="/app/webhooks">Explore webhook testing →</Link></section></div></div></>:page==='contact'?<ContactForm/>:info[page]?<><Head title={info[page][0]} description={info[page][1]}/><div className="pl-prose">{info[page][2].map(t=><p key={t}>{t}</p>)}<Link className="pl-btn pl-secondary" to="/app">Explore the product →</Link></div></>:<><Head title="This page has moved." description="Postlane is now being designed for developer email."/><Link className="pl-btn" to="/app/setup">Explore the new setup →</Link></>}</main><Footer/></div>;}
