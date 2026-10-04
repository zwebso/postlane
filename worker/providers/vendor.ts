import type {
  DeliveryCheckInput,
  MailProvider,
  ProviderResult,
  TransactionalResult,
  WebmailHandoff,
} from "./types";

/**
 * Placeholder for a licensed mailbox vendor (Titan-class, Google, Microsoft, or a
 * separately operated MTA). Do not implement API calls until a contract, DPA,
 * and retention terms exist.
 */
export class VendorMailboxProvider implements MailProvider {
  readonly id = "vendor";
  readonly label = "Licensed mailbox vendor";
  readonly mock = true;

  async provisionMailbox(): Promise<ProviderResult> {
    return {
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "A licensed mailbox vendor is not configured. IMAP, Outlook, and attachments need this adapter later.",
      retryable: false,
    };
  }

  async deleteMailbox(): Promise<ProviderResult> {
    return {
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "A licensed mailbox vendor is not configured.",
      retryable: false,
    };
  }

  async provisionAlias(): Promise<ProviderResult> {
    return {
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "A licensed mailbox vendor is not configured.",
      retryable: false,
    };
  }

  async runDeliveryCheck(_input: DeliveryCheckInput) {
    return {
      status: "failed" as const,
      evidence: "Vendor adapter is a stub. No mailbox host has been licensed.",
    };
  }

  async sendTransactional(): Promise<TransactionalResult> {
    return {
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "A licensed mailbox vendor is not configured. System mail still uses Cloudflare when MAIL_PROVIDER=cloudflare.",
      retryable: false,
    };
  }

  getWebmailHandoff(): WebmailHandoff {
    return {
      kind: "unavailable",
      message: "Vendor-hosted webmail is unavailable until a mailbox vendor is licensed.",
    };
  }
}
