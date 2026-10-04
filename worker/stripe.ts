import { normalizePlan, PLAN_CATALOG, type PlanId } from "../shared/domain";
import { id, nowIso } from "./lib";

type StripeErrorBody = { error?: { message?: string } };

export function stripeConfigured(env: Env) {
  return Boolean(env.STRIPE_SECRET_KEY?.trim());
}

export function localSubscriptionStatus(stripeStatus: string): "active" | "pending" {
  return stripeStatus === "active" || stripeStatus === "trialing" ? "active" : "pending";
}

export async function verifyStripeSignature(payload: string, header: string, secret: string) {
  const fields = header.split(",").map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index), part.slice(index + 1)] as const;
  });
  const timestamp = fields.find(([key]) => key === "t")?.[1];
  const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || signatures.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((signature) => timingSafeEqual(signature, expected));
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function stripeFetch<T>(env: Env, path: string, params?: URLSearchParams, method = "POST"): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: params?.toString(),
  });
  const data = (await response.json()) as T & StripeErrorBody;
  if (!response.ok) throw new Error(data.error?.message || "Stripe request failed.");
  return data;
}

export async function stripePriceId(env: Env, plan: "launch" | "scale") {
  const lookup = `postlane_${plan}`;
  const existing = await stripeFetch<{ data: { id: string }[] }>(
    env,
    `/prices?${new URLSearchParams({ "lookup_keys[]": lookup, active: "true" })}`,
    undefined,
    "GET",
  );
  if (existing.data[0]?.id) return existing.data[0].id;
  const spec = PLAN_CATALOG[plan];
  const created = await stripeFetch<{ id: string }>(
    env,
    "/prices",
    new URLSearchParams({
      currency: "usd",
      unit_amount: String(spec.priceCents),
      "recurring[interval]": "month",
      lookup_key: lookup,
      "product_data[name]": `Postlane ${spec.label}`,
    }),
  );
  return created.id;
}

export async function stripeCheckout(
  env: Env,
  input: { workspaceId: string; plan: "launch" | "scale"; email: string; origin: string; customerId?: string | null },
) {
  const price = await stripePriceId(env, input.plan);
  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${input.origin}/app/usage?checkout=success`,
    cancel_url: `${input.origin}/app/usage?checkout=cancel`,
    client_reference_id: input.workspaceId,
    "metadata[workspace_id]": input.workspaceId,
    "metadata[plan]": input.plan,
    "subscription_data[metadata][workspace_id]": input.workspaceId,
    "subscription_data[metadata][plan]": input.plan,
  });
  if (input.customerId) params.set("customer", input.customerId);
  else params.set("customer_email", input.email);
  return stripeFetch<{ id: string; url: string }>(env, "/checkout/sessions", params);
}

export async function stripeChangePlan(env: Env, subscriptionId: string, plan: "launch" | "scale") {
  const price = await stripePriceId(env, plan);
  const current = await stripeFetch<{ items: { data: { id: string }[] } }>(env, `/subscriptions/${subscriptionId}`, undefined, "GET");
  const item = current.items.data[0]?.id;
  if (!item) throw new Error("Stripe subscription has no price to change.");
  return stripeFetch<{ id: string; status: string }>(
    env,
    `/subscriptions/${subscriptionId}`,
    new URLSearchParams({
      "items[0][id]": item,
      "items[0][price]": price,
      proration_behavior: "create_prorations",
      cancel_at_period_end: "false",
      "metadata[plan]": plan,
    }),
  );
}

export async function stripeCancelAtPeriodEnd(env: Env, subscriptionId: string) {
  return stripeFetch<{ id: string; cancel_at_period_end: boolean; current_period_end?: number }>(
    env,
    `/subscriptions/${subscriptionId}`,
    new URLSearchParams({ cancel_at_period_end: "true" }),
  );
}

export async function stripePortal(env: Env, customerId: string, origin: string) {
  const params = new URLSearchParams({ customer: customerId, return_url: `${origin}/app/usage` });
  try {
    return await stripeFetch<{ url: string }>(env, "/billing_portal/sessions", params);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (!/configuration/i.test(message)) throw err;
    const configuration = await stripeFetch<{ id: string }>(
      env,
      "/billing_portal/configurations",
      new URLSearchParams({
        "features[invoice_history][enabled]": "true",
        "features[payment_method_update][enabled]": "true",
        "features[subscription_cancel][enabled]": "true",
        "features[subscription_cancel][mode]": "at_period_end",
      }),
    );
    params.set("configuration", configuration.id);
    return stripeFetch<{ url: string }>(env, "/billing_portal/sessions", params);
  }
}

type StripeObject = {
  id?: string;
  object?: string;
  status?: string;
  customer?: string;
  subscription?: string;
  payment_status?: string;
  client_reference_id?: string;
  metadata?: { workspace_id?: string; plan?: string };
  amount_paid?: number;
  number?: string;
  created?: number;
};

export type StripeEvent = { id: string; type: string; data: { object: StripeObject } };

function workspaceFrom(object: StripeObject) {
  return object.metadata?.workspace_id || object.client_reference_id || "";
}

export async function applyStripeEvent(db: D1Database, event: StripeEvent) {
  const object = event.data.object;
  const workspaceHint = workspaceFrom(object);
  try {
    await db
      .prepare(
        `INSERT INTO billing_events (id, workspace_id, external_event_id, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id(), workspaceHint || "stripe", event.id, event.type, JSON.stringify({ type: event.type }), nowIso())
      .run();
  } catch {
    return;
  }
  const now = nowIso();
  if (event.type === "checkout.session.completed") {
    const workspaceId = workspaceFrom(object);
    const plan = normalizePlan(object.metadata?.plan);
    if (!workspaceId || plan === "sandbox") return;
    if (object.payment_status !== "paid" && object.status !== "complete") return;
    await db
      .prepare(
        `UPDATE subscriptions
         SET plan = ?, status = 'active', provider = 'stripe', external_ref = ?, stripe_customer_id = ?, updated_at = ?
         WHERE workspace_id = ?`,
      )
      .bind(plan, object.subscription || null, object.customer || null, now, workspaceId)
      .run();
    return;
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const workspaceId = await findWorkspace(db, object);
    if (!workspaceId) return;
    if (object.status === "canceled") {
      await markSandbox(db, workspaceId, object.customer || null);
      return;
    }
    const plan = object.metadata?.plan ? normalizePlan(object.metadata.plan) : null;
    const status = localSubscriptionStatus(object.status || "");
    await db
      .prepare(
        `UPDATE subscriptions
         SET plan = COALESCE(?, plan), status = ?, provider = 'stripe', external_ref = ?, stripe_customer_id = COALESCE(?, stripe_customer_id), updated_at = ?
         WHERE workspace_id = ?`,
      )
      .bind(plan && plan !== "sandbox" ? plan : null, status, object.id || null, object.customer || null, now, workspaceId)
      .run();
    return;
  }
  if (event.type === "customer.subscription.deleted") {
    const workspaceId = await findWorkspace(db, object);
    if (workspaceId) await markSandbox(db, workspaceId, object.customer || null);
    return;
  }
  if (event.type === "invoice.payment_failed") {
    if (!object.subscription) return;
    await db
      .prepare("UPDATE subscriptions SET status = 'pending', updated_at = ? WHERE external_ref = ?")
      .bind(now, object.subscription)
      .run();
    return;
  }
  if (event.type === "invoice.paid" && object.subscription) {
    const row = await db
      .prepare("SELECT workspace_id FROM subscriptions WHERE external_ref = ?")
      .bind(object.subscription)
      .first<{ workspace_id: string }>();
    if (!row) return;
    await db
      .prepare(
        `INSERT INTO invoices (id, workspace_id, number, amount_cents, status, issued_at)
         VALUES (?, ?, ?, ?, 'paid', ?)`,
      )
      .bind(id(), row.workspace_id, object.number || object.id || event.id, object.amount_paid || 0, now)
      .run();
  }
}

async function findWorkspace(db: D1Database, object: StripeObject) {
  const hinted = workspaceFrom(object);
  if (hinted) return hinted;
  const row = await db
    .prepare("SELECT workspace_id FROM subscriptions WHERE external_ref = ? OR stripe_customer_id = ?")
    .bind(object.id || "", object.customer || object.id || "")
    .first<{ workspace_id: string }>();
  return row?.workspace_id || "";
}

async function markSandbox(db: D1Database, workspaceId: string, customerId: string | null) {
  await db
    .prepare(
      `UPDATE subscriptions
       SET plan = 'sandbox', status = 'active', external_ref = NULL, stripe_customer_id = COALESCE(?, stripe_customer_id), updated_at = ?
       WHERE workspace_id = ?`,
    )
    .bind(customerId, nowIso(), workspaceId)
    .run();
}

export function paidPlan(plan: PlanId): plan is "launch" | "scale" {
  return plan === "launch" || plan === "scale";
}
