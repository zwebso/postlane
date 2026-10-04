import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "./api";
import type { ProviderStatus, SessionUser, WorkspaceRef } from "./types";
import { Icon } from "./ui";

const PRIMARY = [
  ["Overview", "overview", "grid"],
  ["Setup guide", "setup/workspace", "check"],
  ["Domains", "domains", "globe"],
  ["Mailboxes", "mailboxes", "mail"],
  ["Inbox", "webmail", "mail"],
  ["Aliases", "aliases", "migration"],
  ["Migration", "migrations", "migration"],
] as const;

const SECONDARY = [
  ["Activity", "activity", "clock"],
  ["Billing", "billing", "card"],
  ["Team", "team", "users"],
  ["Security", "/account/security", "shield"],
  ["Settings", "settings", "settings"],
] as const;

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div>
      <div className="auth-brand">
        <div className="brand">
          <span className="brandmark">
            <Icon name="mail" />
          </span>
          postlane
        </div>
      </div>
      {children}
      <p className="auth-foot">© 2026 Postlane · Working brand</p>
    </div>
  );
}

export function AppShell({
  user,
  workspace,
  children,
  setupPending,
  provider,
}: {
  user: SessionUser;
  workspace: WorkspaceRef;
  children: ReactNode;
  setupPending?: boolean;
  provider?: ProviderStatus | null;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { workspace: slug } = useParams();
  const loc = useLocation();
  const crumb = loc.pathname.split("/").filter(Boolean).slice(-1)[0] ?? "overview";

  const nav = (
    <>
      <Link className="brand" to={`/w/${workspace.slug}/overview`}>
        <span className="brandmark">
          <Icon name="mail" />
        </span>
        postlane
      </Link>
      <button className="workspace-switch" type="button" onClick={() => navigate(`/w/${workspace.slug}/settings`)}>
        <span className="flex">
          <span className="avatar">{initials(workspace.name)}</span>
          {workspace.name}
        </span>
        <span aria-hidden>⌄</span>
      </button>
      <div className="navlabel">Workspace</div>
      <nav>
        {PRIMARY.map(([label, path, icon]) => (
          <NavLink
            key={path}
            to={path.startsWith("/") ? path : `/w/${workspace.slug}/${path}`}
            className={({ isActive }) => `nav ${isActive ? "active" : ""}`}
            onClick={() => setOpen(false)}
          >
            <Icon name={icon} />
            {label}
            {label === "Setup guide" && setupPending ? <span className="count">2</span> : null}
          </NavLink>
        ))}
      </nav>
      <div className="navlabel">Manage</div>
      <nav>
        {SECONDARY.map(([label, path, icon]) => (
          <NavLink
            key={path}
            to={path.startsWith("/") ? path : `/w/${workspace.slug}/${path}`}
            className={({ isActive }) => `nav ${isActive ? "active" : ""}`}
            onClick={() => setOpen(false)}
          >
            <Icon name={icon} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="helpbox">
          <strong>A little help goes a long way.</strong>
          We’ll guide you through your first mailbox.
          <br />
          <Link className="text-button" to="/support">
            Visit help center ↗
          </Link>
        </div>
        <div className="flex" style={{ padding: 12 }}>
          <span className="avatar">{initials(user.name)}</span>
          <div style={{ fontSize: 13 }}>
            {user.name}
            <div className="row-note">{workspace.role}</div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className={`shell ${import.meta.env.DEV ? "withbar" : ""}`}>
      <aside className="sidebar">{nav}</aside>
      {open ? (
        <>
          <div className="drawer-backdrop" onClick={() => setOpen(false)} />
          <aside className="drawer" role="dialog" aria-label="Workspace navigation">
            {nav}
          </aside>
        </>
      ) : null}
      <main className="main">
        <header className="topbar">
          <div className="flex">
            <button className="menu-toggle ghost" aria-label="Open navigation" onClick={() => setOpen(true)}>
              <Icon name="menu" />
            </button>
            <div className="crumb">
              Workspace <span>/</span>
              <span style={{ color: "var(--ink)" }}>{crumb}</span>
            </div>
          </div>
          <div className="top-actions">
            <span className="mock-pill">{provider && !provider.mock ? provider.label : "Mock provider"}</span>
            <span className="divider" />
            <Link className="ghost" to={`/w/${slug}/notifications`} aria-label="Open notifications">
              <Icon name="bell" />
            </Link>
            <span className="avatar">{initials(user.name)}</span>
            <button
              className="ghost"
              onClick={async () => {
                await api.logout();
                navigate("/login");
              }}
            >
              Sign out
            </button>
          </div>
        </header>
        <div className="content">
          {children}
          <div className="footer">
            <span>© 2026 Postlane · Working brand</span>
            <span>No live email · Mock adapter</span>
          </div>
        </div>
      </main>
    </div>
  );
}
