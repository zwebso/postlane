import { inboundCount, storeRawMessage } from "../mail-store";
import { buildTextEmail } from "./mime";
import { SYSTEM_MAIL_FROM } from "./spec";
import type {
  DeliveryCheckInput,
  MailProvider,
  ProviderResult,
  TransactionalResult,
  WebmailHandoff,
} from "./types";

function asList(value?: string | string[]) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map((item) => item.trim()).filter(Boolean);
}

async function sendRaw(
  env: Env,
  input: {
    from: string;
    fromName?: string;
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    subject: string;
    text: string;
    html?: string;
    raw: string;
    extraHeaders?: Record<string, string>;
  },
): Promise<TransactionalResult> {
  if (!env.EMAIL) {
    return {
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "SendEmail is not bound. Enable Email Sending and add the EMAIL binding.",
      retryable: false,
    };
  }
  const to = asList(input.to);
  try {
    const result = await env.EMAIL.send({
      from: input.fromName ? { email: input.from, name: input.fromName } : input.from,
      to,
      cc: asList(input.cc),
      bcc: asList(input.bcc),
      replyTo: input.replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
      headers: input.extraHeaders,
    });
    return { ok: true, messageId: result && typeof result === "object" ? result.messageId : undefined };
  } catch (structuredErr) {
    const code = (structuredErr as { code?: string })?.code || "SEND_FAILED";
    if (input.html || to.length > 1 || input.cc || input.bcc) {
      const first = structuredErr instanceof Error ? structuredErr.message : "Email Sending rejected this message.";
      return { ok: false, code, message: first, retryable: !["E_SENDER_NOT_VERIFIED", "E_SENDER_DOMAIN_NOT_AVAILABLE"].includes(code) };
    }
    try {
      const { EmailMessage } = await import("cloudflare:email");
      await env.EMAIL.send(new EmailMessage(input.from, to[0] || "", input.raw));
      return { ok: true };
    } catch (err) {
      const first = structuredErr instanceof Error ? structuredErr.message : "SendEmail rejected this message.";
      const second = err instanceof Error ? err.message : first;
      const fallbackCode = (structuredErr as { code?: string })?.code || "SEND_FAILED";
      return { ok: false, code: fallbackCode, message: second || first, retryable: fallbackCode !== "E_SENDER_NOT_VERIFIED" };
    }
  }
}

function systemFrom(env: Env) {
  return env.SYSTEM_MAIL_FROM || SYSTEM_MAIL_FROM;
}

export class CloudflareMailProvider implements MailProvider {
  readonly id = "cloudflare";
  readonly label = "Cloudflare Email Routing";
  readonly mock = false;

  constructor(private env: Env) {}

  async provisionMailbox(input: {
    address: string;
    displayName: string;
    quotaMb: number;
    idempotencyKey: string;
  }): Promise<ProviderResult> {
    return {
      ok: true,
      mailbox: {
        providerId: `cf_${input.idempotencyKey.slice(0, 12)}`,
        status: "prepared",
        message:
          "Mailbox reserved for the catch-all Worker. It stays inactive until every activation gate passes, including a real inbound store and SendEmail.",
      },
    };
  }

  async deleteMailbox(): Promise<ProviderResult> {
    return {
      ok: true,
      mailbox: {
        providerId: "cf_deleted",
        status: "prepared",
        message: "Mailbox marked deleted in Postlane. Catch-all will reject this address. Message bytes in R2 are not purged automatically.",
      },
    };
  }

  async provisionAlias(input: { address: string; destination: string }): Promise<ProviderResult> {
    return {
      ok: true,
      mailbox: {
        providerId: `cf_alias_${input.address}`,
        status: "prepared",
        message: `Alias ${input.address} will follow the catch-all Worker to ${input.destination}.`,
      },
    };
  }

  async sendTransactional(input: {
    to: string | string[];
    subject: string;
    text: string;
    html?: string;
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    purpose: "verify" | "reset" | "invite" | "delivery" | "compose";
    from?: string;
    extraHeaders?: Record<string, string>;
    mailboxId?: string;
    workspaceId?: string;
  }): Promise<TransactionalResult> {
    const from = input.from || systemFrom(this.env);
    const to = Array.isArray(input.to) ? input.to[0] : input.to;
    const raw = buildTextEmail({
      from,
      fromName: input.from ? undefined : "Postlane",
      to,
      subject: input.subject,
      text: input.text,
      extraHeaders: input.extraHeaders,
    });
    const sent = await sendRaw(this.env, {
      from,
      fromName: input.from ? undefined : "Postlane",
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      replyTo: input.replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
      raw,
      extraHeaders: input.extraHeaders,
    });
    if (sent.ok) {
      await storeRawMessage(this.env, {
        workspaceId: input.workspaceId,
        mailboxId: input.mailboxId,
        direction: input.purpose === "compose" ? "outbound" : "system",
        from,
        to,
        subject: input.subject,
        raw,
        correlationToken: input.extraHeaders?.["X-Postlane-Check"],
      }).catch(() => undefined);
    }
    return sent;
  }

  async runDeliveryCheck(input: DeliveryCheckInput) {
    if (input.direction === "inbound") {
      if (!input.mailboxId) {
        return { status: "failed" as const, evidence: "Inbound check needs a prepared mailbox." };
      }
      const stored = await inboundCount(this.env.DB, input.mailboxId);
      if (stored > 0) {
        return {
          status: "passed" as const,
          evidence: `${stored} inbound message(s) are stored in R2/D1 for this mailbox.`,
        };
      }
      if (!input.mailboxAddress) {
        return { status: "failed" as const, evidence: "No mailbox address is available for an inbound probe." };
      }
      const probe = await this.sendTransactional({
        to: input.mailboxAddress,
        subject: `Postlane inbound check ${input.correlationToken.slice(0, 8)}`,
        text: "This is a delivery probe. If Email Routing is working, the catch-all Worker stores it and the next check passes.",
        purpose: "delivery",
        extraHeaders: { "X-Postlane-Check": input.correlationToken },
      });
      if (!probe.ok) {
        return { status: "failed" as const, evidence: probe.message };
      }
      return {
        status: "timeout" as const,
        evidence:
          "Inbound probe was accepted by SendEmail. Run this check again after the catch-all Worker stores the message. A mailbox is not marked live from SendEmail alone.",
      };
    }

    if (!input.recoveryEmail) {
      return { status: "failed" as const, evidence: "Outbound check needs the workspace recovery address." };
    }
    const sent = await this.sendTransactional({
      to: input.recoveryEmail,
      subject: "Postlane outbound delivery check",
      text: `Postlane accepted this message for SendEmail. Inbox placement is not guaranteed.\n\nCheck token: ${input.correlationToken}`,
      purpose: "delivery",
      extraHeaders: { "X-Postlane-Check": input.correlationToken },
    });
    if (!sent.ok) {
      return { status: "failed" as const, evidence: sent.message };
    }
    return {
      status: "passed" as const,
      evidence:
        "SendEmail accepted a text-only message to the recovery address. This is not inbox placement, IMAP, or attachment support.",
    };
  }

  getWebmailHandoff(input: { workspaceSlug: string; mailboxAddress?: string }): WebmailHandoff {
    const origin = (this.env.APP_ORIGIN || "").replace(/\/$/, "");
    return {
      kind: "preview",
      url: `${origin}/w/${input.workspaceSlug}/webmail`,
      label: "Postlane webmail preview",
    };
  }
}
