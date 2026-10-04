#!/usr/bin/env node
/**
 * Postlane MCP server. Speaks newline-delimited JSON-RPC on stdin/stdout.
 * POSTLANE_API_KEY is a pl_live_ bearer key. It is never written to logs.
 */
import { pathToFileURL } from "node:url";

const DEFAULT_BASE = "https://www.postlane.email";

export function apiBase(env = process.env) {
  return String(env.POSTLANE_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
}

export function apiKey(env = process.env) {
  const key = String(env.POSTLANE_API_KEY || "").trim();
  if (!key || key.includes("${") || !key.startsWith("pl_live_")) return "";
  return key;
}

const sendSchema = {
  type: "object",
  properties: {
    from: { type: "string", description: "Verified sender, such as hello@send.example.com" },
    to: { description: "Recipient email, or an array of emails", oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
    cc: { description: "Optional Cc", oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
    bcc: { description: "Optional Bcc", oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
    reply_to: { type: "string" },
    subject: { type: "string" },
    html: { type: "string" },
    text: { type: "string" },
    template: { type: "string", description: "Saved template name, such as Reset your password" },
    variables: { type: "object", additionalProperties: { type: "string" } },
    idempotency_key: { type: "string", description: "Stable key for this logical send. Reuse it on retry." },
  },
  required: ["from", "to", "idempotency_key"],
};

const tools = [
  {
    name: "send_email",
    description: "Send one transactional email through Postlane POST /v1/emails. The from domain must already be verified.",
    inputSchema: sendSchema,
  },
  {
    name: "get_email",
    description: "Read one Postlane send and its events by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Send id, such as em_…" } },
      required: ["id"],
    },
  },
  {
    name: "list_emails",
    description: "List recent Postlane sends for this API key. Requires Read activity or Full access.",
    inputSchema: { type: "object", properties: {} },
  },
];

export function buildSendBody(args) {
  const body = {
    from: args.from,
    to: args.to,
  };
  if (args.cc) body.cc = args.cc;
  if (args.bcc) body.bcc = args.bcc;
  if (args.reply_to) body.reply_to = args.reply_to;
  if (args.subject) body.subject = args.subject;
  if (args.html) body.html = args.html;
  if (args.text) body.text = args.text;
  if (args.template) body.template = args.template;
  if (args.variables && Object.keys(args.variables).length) body.variables = args.variables;
  return body;
}

function textResult(text, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

export async function callTool(name, args, env = process.env, fetchImpl = fetch) {
  const key = apiKey(env);
  if (!key) {
    return textResult(
      "Set POSTLANE_API_KEY to a pl_live_ key from https://www.postlane.email/app/api-keys, then reload the Postlane MCP server.",
      true,
    );
  }
  const base = apiBase(env);
  const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };

  if (name === "list_emails") {
    return readJson(await fetchImpl(`${base}/v1/emails`, { headers }));
  }
  if (name === "get_email") {
    const id = String(args?.id || "").trim();
    if (!id) return textResult("id is required.", true);
    return readJson(await fetchImpl(`${base}/v1/emails/${encodeURIComponent(id)}`, { headers }));
  }
  if (name === "send_email") {
    const idempotencyKey = String(args?.idempotency_key || "").trim();
    if (!idempotencyKey) return textResult("idempotency_key is required. Use one stable key per logical send.", true);
    if (!args?.from || !args?.to) return textResult("from and to are required.", true);
    const hasBody = args.subject || args.html || args.text || args.template;
    if (!hasBody) return textResult("Provide subject with html or text, or a template name.", true);
    return readJson(
      await fetchImpl(`${base}/v1/emails`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(buildSendBody(args)),
      }),
    );
  }
  return textResult(`Unknown tool: ${name}`, true);
}

async function readJson(response) {
  const raw = await response.text();
  let parsed = raw;
  try {
    parsed = JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    parsed = raw.slice(0, 2000);
  }
  if (!response.ok) return textResult(parsed || `Postlane returned ${response.status}.`, true);
  return textResult(parsed);
}

export async function handleMessage(message, env = process.env, fetchImpl = fetch) {
  if (!message || typeof message !== "object") return null;
  if (typeof message.method === "string" && message.method.startsWith("notifications/")) return null;
  const id = message.id ?? null;
  if (message.method === "initialize") {
    const requested = message.params?.protocolVersion;
    const protocolVersion = requested === "2025-06-18" || requested === "2025-03-26" ? requested : "2024-11-05";
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "postlane", version: "0.1.0" },
      },
    };
  }
  if (message.method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (message.method === "tools/list") return { jsonrpc: "2.0", id, result: { tools } };
  if (message.method === "tools/call") {
    try {
      const result = await callTool(message.params?.name, message.params?.arguments ?? {}, env, fetchImpl);
      return { jsonrpc: "2.0", id, result };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Postlane request failed.";
      return { jsonrpc: "2.0", id, result: textResult(detail, true) };
    }
  }
  if (id === null) return null;
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${message.method}` } };
}

function start() {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      handleMessage(message)
        .then((response) => {
          if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
        })
        .catch((error) => {
          const detail = error instanceof Error ? error.message : "Postlane MCP failed.";
          process.stderr.write(`${detail}\n`);
          if (message.id != null) {
            process.stdout.write(
              `${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: detail } })}\n`,
            );
          }
        });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
