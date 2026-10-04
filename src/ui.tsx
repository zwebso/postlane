import { useEffect, useId, useRef, type ReactNode } from "react";

const PATHS: Record<string, string> = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  mail: "M3 5h18v14H3z M3 5l9 7 9-7",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M3 12h18 M12 3c-5 6-5 12 0 18 M12 3c5 6 5 12 0 18",
  check: "M5 12l4 4L19 6",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  bell: "M6 16V9a6 6 0 0 1 12 0v7l2 2H4z M10 21h4",
  users: "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
  card: "M3 5h18v14H3z M3 10h18 M6 15h4",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 16v1",
  plus: "M12 5v14 M5 12h14",
  settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
  copy: "M8 8h12v13H8z M16 8V3H3v13h5",
  alert: "M12 3l10 18H2z M12 9v5 M12 17v1",
  menu: "M4 7h16 M4 12h16 M4 17h16",
  migration: "M3 7h16 M15 3l4 4-4 4 M21 17H5 M9 13l-4 4 4 4",
};

export function Icon({ name, label }: { name: string; label?: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden={!label} aria-label={label}>
      <path d={PATHS[name] ?? PATHS.grid} />
    </svg>
  );
}

export function Badge({ children, tone = "" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Banner({ tone = "", children }: { tone?: string; children: ReactNode }) {
  return (
    <div role="status" className={`banner ${tone}`}>
      <Icon name="alert" />
      <span>{children}</span>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const fid = useId();
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <div className="field-control">
        {typeof children === "object" && children && "type" in (children as { type?: string })
          ? children
          : children}
      </div>
      {hint && !error ? <small>{hint}</small> : null}
      {error ? (
        <small className="field-error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  hint,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <input id={fieldId} aria-invalid={Boolean(error)} {...props} />
      {hint && !error ? <small>{hint}</small> : null}
      {error ? (
        <small className="field-error" id={`${fieldId}-error`} role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card empty">
      <Icon name="mail" />
      <h2>{title}</h2>
      <p className="sub">{body}</p>
      {action}
    </div>
  );
}

export function PageHead({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <div className="sub">{subtitle}</div>
      </div>
      {action}
    </div>
  );
}

export function RecordCard({
  title,
  type,
  host,
  value,
  status,
  tone,
  detected,
  lastCheck,
  nextCheck,
}: {
  title: string;
  type: string;
  host: string;
  value: string;
  status: string;
  tone?: string;
  detected?: string | null;
  lastCheck?: string | null;
  nextCheck?: string | null;
}) {
  return (
    <div className="record">
      <div className="record-header">
        <strong>{title}</strong>
        <Badge tone={tone}>{status}</Badge>
      </div>
      <div className="record-fields">
        <div>
          <small>Type</small>
          <code>{type}</code>
        </div>
        <div>
          <small>Name / host</small>
          <code>{host}</code>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
            } catch {
              /* user can select */
            }
          }}
        >
          Copy
        </button>
        <div>
          <small>{type === "MX" ? "Priority" : "TTL"}</small>
          <code>{type === "MX" ? "10" : "Auto"}</code>
        </div>
        <div>
          <small>Value</small>
          <code>{value}</code>
        </div>
        <span />
      </div>
      {detected || lastCheck ? (
        <div className="pad" style={{ paddingTop: 0 }}>
          <p className="row-note">Detected: {detected || "none"}</p>
          {lastCheck ? <p className="row-note">Last check {new Date(lastCheck).toLocaleString()}</p> : null}
          {nextCheck ? <p className="row-note">Next check {new Date(nextCheck).toLocaleString()}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<Element | null>(document.activeElement);
  useEffect(() => {
    const node = ref.current;
    const focusable = node?.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]");
    focusable?.[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && focusable && focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (trigger.current instanceof HTMLElement) trigger.current.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref} onClick={(e) => e.stopPropagation()}>
        <button className="ghost" style={{ float: "right" }} aria-label="Close dialog" onClick={onClose}>
          ×
        </button>
        <h2 id="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}

export function LoadingCard() {
  return (
    <div className="card pad" aria-busy="true">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className={`skeleton ${i % 2 ? "wide" : ""}`} />
      ))}
    </div>
  );
}
