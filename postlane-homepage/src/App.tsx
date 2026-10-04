import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "./api";
import {
  ActivityPage,
  BillingPage,
  NotificationsPage,
  OpsPage,
  ScreenLibraryPage,
  SecurityPage,
  SettingsPage,
  SupportPage,
  TeamPage,
  WebmailPage,
} from "./pages/AccountPages";
import { ForgotPasswordPage, InvitationPage, LoginPage, ResetPasswordPage, SignupPage, VerifyEmailPage } from "./pages/AuthPages";
import { SetupPage } from "./pages/SetupPages";
import {
  AliasesPage,
  DomainDetailPage,
  DomainsPage,
  MailboxDetailPage,
  MailboxesPage,
  MigrationPage,
  OverviewPage,
} from "./pages/WorkspacePages";
import { AppShell, AuthShell } from "./layout";
import { HomePage } from "./pages/HomePage";
import { MarketingPage } from "./pages/MarketingPages";
const PUBLIC_PAGES = ["get-started", "about", "migration", "security", "help", "contact", "status", "privacy", "terms", "acceptable-use", "abuse"];
import type { ProviderStatus, SessionUser, SetupSnapshot, WorkspaceRef } from "./types";
import { LoadingCard, PageHead, Toast } from "./ui";

const DEV_SCREENS = [
  ["/", "Homepage"],
  ["/signup", "Sign up"],
  ["/login", "Sign in"],
  ["/verify-email", "Verify email"],
  ["/forgot-password", "Forgot password"],
  ["/reset-password", "Reset password"],
  ["/w/demo/overview", "Overview"],
  ["/w/demo/setup/workspace", "Setup"],
  ["/w/demo/domains", "Domains"],
  ["/w/demo/mailboxes", "Mailboxes"],
  ["/w/demo/aliases", "Aliases"],
  ["/w/demo/migrations", "Migration"],
  ["/w/demo/billing", "Billing"],
  ["/w/demo/team", "Team"],
  ["/account/security", "Security"],
  ["/w/demo/settings", "Settings"],
  ["/w/demo/notifications", "Notifications"],
  ["/w/demo/activity", "Activity"],
  ["/support", "Support"],
  ["/w/demo/webmail", "Webmail"],
  ["/mail", "Webmail preview"],
  ["/ops", "Operations"],
  ["/dev/library", "Screen library"],
];

function DevViewer({ provider }: { provider?: ProviderStatus | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  if (!import.meta.env.DEV || (location.pathname === "/" || PUBLIC_PAGES.includes(location.pathname.slice(1)))) return null;
  return (
    <div className="screen-browser">
      <strong>POSTLANE / DEV VIEWER</strong>
      <label>
        Screen{" "}
        <select aria-label="Preview screen" value={location.pathname} onChange={(e) => navigate(e.target.value)}>
          {DEV_SCREENS.map(([href, label]) => (
            <option key={href} value={href}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="right">
        <span className="mock-pill">{provider && !provider.mock ? provider.label : "Mock mode"}</span>
        <Link to="/dev/library">Screen library</Link>
      </div>
    </div>
  );
}

function WorkspaceFrame({
  user,
  workspaces,
  provider,
  children,
}: {
  user: SessionUser;
  workspaces: WorkspaceRef[];
  provider?: ProviderStatus | null;
  children: (ctx: { setup: SetupSnapshot | null; refresh: () => Promise<void>; toast: (m: string) => void }) => ReactNode;
}) {
  const { workspace: slug } = useParams();
  const workspace = workspaces.find((w) => w.slug === slug) ?? workspaces[0];
  const [message, setMessage] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SetupSnapshot | null>(null);
  const refresh = useCallback(async () => {
    if (!slug || slug === "new" || slug === "demo") return;
    setSnapshot(await api.setup(slug));
  }, [slug]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(null), 3500);
    return () => window.clearTimeout(t);
  }, [message]);
  const shellWs = workspace ?? {
    id: "pending",
    slug: slug ?? "new",
    name: slug && slug !== "new" ? slug : "New workspace",
    role: "owner",
  };
  return (
    <AppShell user={user} workspace={shellWs} setupPending={!snapshot?.activationAllowed} provider={snapshot?.provider ?? provider}>
      {children({ setup: snapshot, refresh, toast: setMessage })}
      <Toast message={message} />
    </AppShell>
  );
}

export function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [ready, setReady] = useState(false);
  const location = useLocation();

  useEffect(() => {
    api
      .session()
      .then((s) => {
        setUser(s.user);
        setWorkspaces(s.workspaces);
        setProvider(s.provider);
      })
      .catch(() => { /* Public pages remain available when session lookup fails. */ })
      .finally(() => setReady(true));
  }, [location.pathname]);

  if (!ready && location.pathname !== "/" && !PUBLIC_PAGES.includes(location.pathname.slice(1))) {
    return (
      <div className="content">
        <PageHead title="Loading your workspace" subtitle="Getting the latest status…" />
        <LoadingCard />
      </div>
    );
  }

  const fallbackWs = workspaces[0] ?? { id: "none", slug: "new", name: "Postlane", role: "owner" };

  return (
    <>
      <DevViewer provider={provider} />
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/verify-email"
          element={<VerifyEmailPage verification={location.state as { url?: string; message?: string; mock?: boolean } | undefined} />}
        />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/invitations/:token" element={<InvitationPage />} />
        <Route path="/" element={<HomePage />} />
        {PUBLIC_PAGES.map(page => <Route key={page} path={`/${page}`} element={<MarketingPage page={page} />} />)}
        <Route
          path="/w/:workspace/*"
          element={
            user ? (
              <WorkspaceFrame user={user} workspaces={workspaces} provider={provider}>
                {({ setup, refresh, toast }) => (
                  <Routes>
                    <Route path="overview" element={<OverviewPage user={user} setup={setup} />} />
                    <Route path="setup/:step" element={<SetupPage setup={setup} refresh={refresh} toast={toast} />} />
                    <Route path="domains" element={<DomainsPage setup={setup} />} />
                    <Route path="domains/:domain" element={<DomainDetailPage setup={setup} refresh={refresh} toast={toast} />} />
                    <Route path="mailboxes" element={<MailboxesPage setup={setup} refresh={refresh} toast={toast} />} />
                    <Route path="mailboxes/:mailbox" element={<MailboxDetailPage setup={setup} refresh={refresh} toast={toast} />} />
                    <Route path="webmail" element={<WebmailPage setup={setup} toast={toast} />} />
                    <Route path="aliases" element={<AliasesPage setup={setup} toast={toast} />} />
                    <Route path="migrations" element={<MigrationPage toast={toast} />} />
                    <Route path="billing" element={<BillingPage setup={setup} toast={toast} />} />
                    <Route path="team" element={<TeamPage toast={toast} />} />
                    <Route path="settings" element={<SettingsPage setup={setup} toast={toast} />} />
                    <Route path="notifications" element={<NotificationsPage />} />
                    <Route path="activity" element={<ActivityPage />} />
                  </Routes>
                )}
              </WorkspaceFrame>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/account/security"
          element={
            user ? (
              <AppShell user={user} workspace={fallbackWs} provider={provider}>
                <SecurityPage toast={() => undefined} />
              </AppShell>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/mail"
          element={
            user ? (
              <AppShell user={user} workspace={fallbackWs} provider={provider}>
                <WebmailPage setup={null} toast={() => undefined} />
              </AppShell>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/support"
          element={
            user ? (
              <AppShell user={user} workspace={fallbackWs} provider={provider}>
                <SupportPage toast={() => undefined} />
              </AppShell>
            ) : (
              <AuthShell>
                <div className="auth">
                  <h1>Support</h1>
                  <p className="sub">Sign in to attach workspace diagnostics. Never share a password.</p>
                  <Link className="primary" to="/login" style={{ display: "inline-flex", padding: "10px 15px" }}>
                    Sign in
                  </Link>
                </div>
              </AuthShell>
            )
          }
        />
        <Route path="/ops" element={<OpsPage />} />
        <Route path="/ops/jobs/:job" element={<OpsPage />} />
        <Route path="/ops/abuse/:case" element={<OpsPage />} />
        <Route path="/ops/incidents/:incident" element={<OpsPage />} />
        {import.meta.env.DEV ? <Route path="/dev/library" element={<ScreenLibraryPage />} /> : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
