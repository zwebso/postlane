import type {
  DeliveryCheckInput,
  MailProvider,
  ProviderResult,
  TransactionalResult,
  WebmailHandoff,
} from "./types";

export class MockMailProvider implements MailProvider {
  readonly id = "mock";
  readonly label = "Mock adapter";
  readonly mock = true;

  async provisionMailbox(input: {
    address: string;
    displayName: string;
    quotaMb: number;
    idempotencyKey: string;
  }): Promise<ProviderResult> {
    return {
      ok: true,
      mailbox: {
        providerId: `mock_${input.idempotencyKey.slice(0, 12)}`,
        status: "prepared",
        message: "Mailbox reserved in mock mode. No mail server was contacted.",
      },
    };
  }

  async deleteMailbox(): Promise<ProviderResult> {
    return {
      ok: true,
      mailbox: {
        providerId: "mock_deleted",
        status: "prepared",
        message: "Mock adapter recorded deletion. No mail server was contacted.",
      },
    };
  }

  async provisionAlias(input: { address: string; destination: string }): Promise<ProviderResult> {
    return {
      ok: true,
      mailbox: {
        providerId: `mock_alias_${input.address}`,
        status: "prepared",
        message: `Alias ${input.address} → ${input.destination} reserved in mock mode.`,
      },
    };
  }

  async runDeliveryCheck(input: DeliveryCheckInput) {
    return {
      status: "failed" as const,
      evidence: `Mock adapter cannot ${input.direction === "inbound" ? "receive" : "send"} mail. Configure Cloudflare or a licensed vendor before activation.`,
    };
  }

  async sendTransactional(): Promise<TransactionalResult> {
    return {
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "No mail provider is configured. Postlane will not send mail.",
      retryable: false,
    };
  }

  getWebmailHandoff(): WebmailHandoff {
    return { kind: "unavailable", message: "Mock adapter has no inbox. Messages are not stored." };
  }
}
