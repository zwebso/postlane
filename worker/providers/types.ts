export type ProviderMailbox = {
  providerId: string;
  status: "prepared" | "failed";
  message: string;
};

export type ProviderResult =
  | { ok: true; mailbox: ProviderMailbox }
  | { ok: false; code: string; message: string; retryable: boolean };

export type TransactionalResult =
  | { ok: true; messageId?: string }
  | { ok: false; code: string; message: string; retryable: boolean };

export type DeliveryCheckInput = {
  direction: "inbound" | "outbound";
  mailboxId?: string;
  mailboxAddress?: string;
  recoveryEmail?: string;
  correlationToken: string;
};

export type DeliveryCheckResult = {
  status: "passed" | "failed" | "timeout";
  evidence: string;
};

export type WebmailHandoff =
  | { kind: "preview"; url: string; label: string }
  | { kind: "provider"; url: string; label: string }
  | { kind: "unavailable"; message: string };

export interface MailProvider {
  readonly id: string;
  readonly label: string;
  readonly mock: boolean;
  provisionMailbox(input: {
    address: string;
    displayName: string;
    quotaMb: number;
    idempotencyKey: string;
  }): Promise<ProviderResult>;
  deleteMailbox(providerId: string): Promise<ProviderResult>;
  provisionAlias(input: { address: string; destination: string }): Promise<ProviderResult>;
  runDeliveryCheck(input: DeliveryCheckInput): Promise<DeliveryCheckResult>;
  sendTransactional(input: {
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
  }): Promise<TransactionalResult>;
  getWebmailHandoff(input: { workspaceSlug: string; mailboxAddress?: string }): WebmailHandoff;
}

export type ProviderStatus = {
  configured: boolean;
  id: string;
  label: string;
  mock: boolean;
  message: string;
  webmail: string;
  dns: string;
  region: string;
  credentials: string;
  quotas: string;
  terms: string;
};
