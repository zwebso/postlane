export type MailTemplate = {
  id: string | null;
  name: string;
  subject: string;
  html: string;
  text: string;
  starter?: boolean;
};

const TOKEN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]{0,40})\s*\}\}/g;

function shell(inner: string) {
  return `<div style="margin:0;padding:24px;background:#fbfbf9;font-family:Arial,sans-serif;color:#252522"><div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e7df;border-radius:12px;padding:28px">${inner}<p style="margin:28px 0 0;font-size:12px;color:#4a4e44">Sent with Postlane</p></div></div>`;
}

export const STARTER_TEMPLATES: MailTemplate[] = [
  {
    id: null,
    name: "Welcome aboard",
    subject: "Welcome aboard, {{first_name}}",
    starter: true,
    html: shell(
      `<h1 style="margin:0 0 12px;font-size:22px">You’re in, {{first_name}}.</h1><p style="margin:0 0 16px;line-height:1.6">Your account is ready. This note confirms the address we have for you.</p><p style="margin:0"><a href="{{action_url}}" style="color:#9a3e1e">Get started</a></p>`,
    ),
    text: "You’re in, {{first_name}}.\n\nYour account is ready. Get started: {{action_url}}\n",
  },
  {
    id: null,
    name: "Reset your password",
    subject: "Reset your password",
    starter: true,
    html: shell(
      `<h1 style="margin:0 0 12px;font-size:22px">Choose a new password</h1><p style="margin:0 0 16px;line-height:1.6">Hi {{first_name}}, this link works once and expires soon.</p><p style="margin:0"><a href="{{reset_url}}" style="color:#9a3e1e">Reset your password</a></p>`,
    ),
    text: "Hi {{first_name}}, reset your password with this one-time link:\n{{reset_url}}\n",
  },
  {
    id: null,
    name: "Your receipt",
    subject: "Your receipt from {{product_name}}",
    starter: true,
    html: shell(
      `<h1 style="margin:0 0 12px;font-size:22px">Payment received</h1><p style="margin:0 0 16px;line-height:1.6">Hi {{first_name}}, this confirms {{amount}} for {{product_name}}.</p>`,
    ),
    text: "Hi {{first_name}}, this confirms {{amount}} for {{product_name}}.\n",
  },
];

export const PREVIEW_VARIABLES: Record<string, string> = {
  first_name: "Alex",
  product_name: "Postlane",
  reset_url: "https://example.com/reset",
  action_url: "https://example.com/start",
  amount: "$20.00",
};

export function templateVariableNames(...parts: string[]) {
  const found = new Set<string>();
  for (const part of parts) {
    for (const match of part.matchAll(TOKEN)) found.add(match[1]);
  }
  return [...found];
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

export function renderTemplate(source: string, variables: Record<string, string>, mode: "text" | "html" = "text") {
  return source.replace(TOKEN, (raw, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key)) return raw;
    const value = variables[key] ?? "";
    return mode === "html" ? escapeHtml(value) : value;
  });
}

export function unsafeTemplateHtml(html: string) {
  return /<\s*script\b|javascript\s*:|\son\w+\s*=/i.test(html);
}

export function readTemplateVariables(input: unknown): { ok: true; variables: Record<string, string> } | { ok: false; message: string } {
  if (input == null) return { ok: true, variables: {} };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, message: "variables must be an object of text values." };
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > 30) return { ok: false, message: "Use 30 variables or fewer." };
  const variables: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key)) {
      return { ok: false, message: `“${key}” is not a usable variable name.` };
    }
    if (typeof value === "number" || typeof value === "boolean") {
      variables[key] = String(value);
      continue;
    }
    if (typeof value !== "string" || value.length > 2000) {
      return { ok: false, message: `“${key}” must be text of 2,000 characters or fewer.` };
    }
    variables[key] = value;
  }
  return { ok: true, variables };
}
