const PLATFORM = "platform";
const PROVIDER = "cloudflare_oauth_app";

export type OAuthApp = { id: string; secret: string };

export function oauthPopupHtml(ok: boolean, domain: string, origin: string, reason = "") {
  const safeDomain = /^[a-z0-9.-]+$/.test(domain) ? domain : "";
  const message = ok
    ? "Connected. You can close this window."
    : reason || "Cloudflare authorization did not complete.";
  return `<!doctype html><title>Cloudflare</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:15px/1.5 DM Sans,Arial,sans-serif;margin:48px 28px;color:#252522}p{max-width:28em}</style>
<p>${message.replace(/[<>&]/g, "")}</p>
<script>
(function(){
  var payload = { type: "postlane-cloudflare", ok: ${ok ? "true" : "false"}, domain: ${JSON.stringify(safeDomain)}, reason: ${JSON.stringify(reason)} };
  try { localStorage.setItem("postlane-cf-oauth", JSON.stringify({ ok: payload.ok, domain: payload.domain, reason: payload.reason, t: Date.now() })); } catch (e) {}
  if (window.opener) {
    try { window.opener.postMessage(payload, ${JSON.stringify(origin)}); } catch (e) {}
  }
  ${ok ? "setTimeout(function(){ window.close(); }, 400);" : ""}
})();
</script>`;
}

export function oauthSetupHtml(origin: string, domain: string) {
  const redirect = `${origin}/api/auth/cloudflare/callback`;
  const safeDomain = /^[a-z0-9.-]+$/.test(domain) ? domain : "";
  return `<!doctype html><title>Connect Cloudflare</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font:15px/1.55 DM Sans,Arial,sans-serif;margin:0;color:#252522;background:#fff}
  main{padding:28px 24px 32px;max-width:420px}
  h1{font:700 22px/1.2 Manrope,Arial,sans-serif;margin:0 0 10px}
  p,li{color:#5c6156;margin:0 0 12px}
  ol{padding-left:18px;margin:0 0 18px}
  code{display:block;background:#f4f5ef;border-radius:8px;padding:8px 10px;font-size:12px;word-break:break-all;margin:8px 0 14px}
  a.btn,button{display:inline-flex;align-items:center;justify-content:center;background:#252522;color:#fff;border:0;border-radius:8px;padding:11px 16px;font:600 13px DM Sans,Arial,sans-serif;text-decoration:none;cursor:pointer}
  a.link{color:#d65a33}
  label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600;margin:0 0 12px}
  input{border:1px solid #deded8;border-radius:8px;padding:10px 12px;font:14px DM Sans,Arial,sans-serif}
</style>
<main>
  <h1>Connect Cloudflare once</h1>
  <p>This is the same kind of login window Resend uses. Create a Postlane app in your Cloudflare account, then customers only click Authorize.</p>
  <ol>
    <li>Open <a class="link" href="https://dash.cloudflare.com/?to=/:account/oauth-clients" target="_blank" rel="noreferrer">Cloudflare → OAuth clients</a></li>
    <li>Create client named <strong>Postlane</strong></li>
    <li>Redirect URL:</li>
  </ol>
  <code>${redirect}</code>
  <p>Scopes: <strong>Zone Read</strong> and <strong>DNS Write</strong>.</p>
  <form method="post" action="/api/auth/cloudflare/setup">
    <input type="hidden" name="domain" value="${safeDomain}">
    <input type="hidden" name="popup" value="1">
    <label>Client ID<input name="client_id" required autocomplete="off"></label>
    <label>Client secret<input name="client_secret" required autocomplete="off"></label>
    <button type="submit">Save and authorize</button>
  </form>
</main>`;
}

export async function saveCloudflareOAuthApp(env: Env, id: string, secret: string) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO workspace_integrations (id, workspace_id, provider, access_token, refresh_token, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, provider) DO UPDATE SET access_token = excluded.access_token, refresh_token = excluded.refresh_token, updated_at = excluded.updated_at`,
  )
    .bind(crypto.randomUUID(), PLATFORM, PROVIDER, id, secret, now, now)
    .run();
}

export async function ensureCloudflareOAuthClient(env: Env): Promise<{ app: OAuthApp | null; error?: string }> {
  const fromEnv: OAuthApp = {
    id: env.CLOUDFLARE_OAUTH_CLIENT_ID?.trim() || "",
    secret: env.CLOUDFLARE_OAUTH_CLIENT_SECRET?.trim() || "",
  };
  if (fromEnv.id && fromEnv.secret) return { app: fromEnv };
  const stored = await env.DB.prepare(
    "SELECT access_token, refresh_token FROM workspace_integrations WHERE workspace_id = ? AND provider = ?",
  )
    .bind(PLATFORM, PROVIDER)
    .first<{ access_token: string; refresh_token: string }>();
  if (stored?.access_token && stored?.refresh_token) {
    return { app: { id: stored.access_token, secret: stored.refresh_token } };
  }
  return { app: null, error: "setup" };
}
