export function buildTextEmail(input: {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  text: string;
  messageId?: string;
  extraHeaders?: Record<string, string>;
}): string {
  const id = input.messageId ?? `<${crypto.randomUUID()}@postlane.email>`;
  const headers = [
    `From: ${input.fromName ? `${input.fromName} <${input.from}>` : input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject.replace(/[\r\n]+/g, " ")}`,
    `Message-ID: ${id}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    ...Object.entries(input.extraHeaders ?? {}).map(([k, v]) => `${k}: ${v}`),
  ];
  return `${headers.join("\r\n")}\r\n\r\n${input.text}\r\n`;
}
