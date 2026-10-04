import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { ApiError } from "../types";
import { AuthShell } from "../layout";
import { Banner, Icon, TextField } from "../ui";

function err(e: unknown) {
  return e as ApiError;
}

export function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", consent: false });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell>
      <form
        className="auth"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const res = await api.signup(form);
            if (res.verification.mock && res.verification.url) sessionStorage.setItem("postlane.verify", res.verification.url);
            else sessionStorage.removeItem("postlane.verify");
            navigate("/verify-email", { state: res.verification });
          } catch (caught) {
            setError(err(caught));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>Your business email starts here.</h1>
        <p className="sub">Create your account, then connect your domain.</p>
        <TextField label="Full name" value={form.name} error={error?.fieldErrors?.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextField
          label="Email address"
          type="email"
          autoComplete="email"
          hint="Use an existing address you can access."
          value={form.email}
          error={error?.fieldErrors?.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 12 characters."
          value={form.password}
          error={error?.fieldErrors?.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <label className="sub">
          <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} /> I agree to the
          terms and privacy policy.
        </label>
        {error?.fieldErrors?.consent ? <p className="field-error">{error.fieldErrors.consent}</p> : null}
        {error && !error.fieldErrors ? <Banner tone="error">{error.message}</Banner> : null}
        <div style={{ marginTop: 20 }}>
          <button className="primary" disabled={busy}>
            Create account
          </button>
        </div>
        <div className="auth-foot">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </form>
    </AuthShell>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthShell>
      <form
        className="auth"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await api.login(form);
            const session = await api.session();
            const first = session.workspaces[0];
            navigate(first ? `/w/${first.slug}/overview` : "/w/new/setup/workspace");
          } catch (caught) {
            setError(err(caught).message);
          }
        }}
      >
        <h1>Welcome back.</h1>
        <p className="sub">Sign in to manage your email workspace.</p>
        <TextField label="Email address" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {error ? <Banner tone="error">{error}</Banner> : null}
        <button className="primary">Sign in</button>
        <div className="auth-foot">
          <Link to="/forgot-password">Forgot your password?</Link>
        </div>
      </form>
    </AuthShell>
  );
}

export function VerifyEmailPage({ verification }: { verification?: { url?: string; message?: string; mock?: boolean } }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const [message, setMessage] = useState<string | null>(null);
  const mock = Boolean(verification?.mock);
  const canVerifyHere = Boolean(token || verification?.url || sessionStorage.getItem("postlane.verify"));
  return (
    <AuthShell>
      <div className="auth">
        <div className="success-mark">
          <Icon name="mail" />
        </div>
        <h1>Check your inbox.</h1>
        <p className="sub">
          {verification?.message ||
            (token
              ? "This link expires and can be used once."
              : "Open the message from noreply@postlane.email when mail is configured.")}
        </p>
        {mock && verification?.url ? (
          <Banner tone="info">Mock verification link is available on this page because no mail provider is configured.</Banner>
        ) : null}
        {canVerifyHere ? (
          <button
            className="primary"
            onClick={async () => {
              const stored = sessionStorage.getItem("postlane.verify") ?? "";
              const value = token || verification?.url?.split("token=")[1] || stored.split("token=")[1];
              if (!value) {
                setMessage("No verification token is available yet.");
                return;
              }
              try {
                await api.verifyEmail(value);
                navigate("/w/new/setup/workspace");
              } catch (caught) {
                setMessage(err(caught).message);
              }
            }}
          >
            Verify this address
          </button>
        ) : (
          <Banner tone="info">We sent a single-use link. Verifying an account does not mark a mailbox live.</Banner>
        )}
        {message ? <p className="field-error">{message}</p> : null}
      </div>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ message: string; url?: string; mock?: boolean } | null>(null);
  return (
    <AuthShell>
      <form
        className="auth"
        onSubmit={async (e) => {
          e.preventDefault();
          setResult(await api.forgotPassword(email));
        }}
      >
        <h1>Let’s get you back in.</h1>
        <p className="sub">Enter the email address you use to sign in.</p>
        <TextField label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="primary">Send reset link</button>
        {result ? (
          <Banner tone="info">
            {result.message}
            {result.mock && result.url ? (
              <>
                {" "}
                <Link to={result.url}>Open reset page</Link>
              </>
            ) : null}
          </Banner>
        ) : null}
      </form>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthShell>
      <form
        className="auth"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password !== confirm) return setError("Passwords do not match.");
          try {
            await api.resetPassword(params.get("token") ?? "", password);
            navigate("/login");
          } catch (caught) {
            setError(err(caught).message);
          }
        }}
      >
        <h1>Choose a new password.</h1>
        <TextField label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <TextField label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error ? <Banner tone="error">{error}</Banner> : null}
        <button className="primary">Reset password</button>
      </form>
    </AuthShell>
  );
}

export function InvitationPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ workspace: string; role: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    api
      .invitation(token)
      .then(setInfo)
      .catch((caught) => setError(err(caught).message));
  }, [token]);
  return (
    <AuthShell>
      <div className="auth">
        <div className="eyebrow">You’re invited</div>
        <h1>{info ? `Join ${info.workspace}.` : "Invitation"}</h1>
        <p className="sub">
          {info
            ? `This grants ${info.role} management access, not access to other people’s messages.`
            : "Checking this invitation."}
        </p>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <button
          className="primary"
          disabled={!info}
          onClick={async () => {
            try {
              await api.acceptInvite(token!);
              navigate("/");
            } catch (caught) {
              setError(err(caught).message);
            }
          }}
        >
          Accept invitation
        </button>
        <div className="auth-foot">
          Wrong account? <Link to="/login">Switch account</Link>
        </div>
      </div>
    </AuthShell>
  );
}
