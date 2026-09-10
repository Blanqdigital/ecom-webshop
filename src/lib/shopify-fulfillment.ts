import { createHmac, timingSafeEqual } from "crypto";
import { getIntegration } from "./integrations";

const API_VERSION = "2024-10";

async function shopifyGraphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ ok: boolean; data?: T; errors?: unknown }> {
  const token = (await getIntegration("shopify_admin_token")).trim();
  const domain = (await getIntegration("shopify_store_domain")).trim();
  if (!token || !domain) {
    return { ok: false, errors: "Shopify not configured" };
  }
  try {
    const res = await fetch(
      `https://${domain}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query, variables }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      data?: T;
      errors?: unknown;
    };
    return {
      ok: res.ok && !json.errors,
      data: json.data,
      errors: json.errors,
    };
  } catch (err) {
    return { ok: false, errors: (err as Error).message };
  }
}

async function webhookSecret(): Promise<string> {
  const fromDb = (await getIntegration("shopify_webhook_secret")).trim();
  if (fromDb) return fromDb;
  return (
    process.env.SHOPIFY_WEBHOOK_SECRET?.trim() ||
    process.env.SHOPIFY_API_SECRET?.trim() ||
    ""
  );
}

export async function shopifyWebhookConfigured(): Promise<boolean> {
  return (await webhookSecret()).length > 0;
}

/**
 * Verify a webhook against the X-Shopify-Hmac-Sha256 header (base64 HMAC of the
 * RAW body — the route must not re-serialise the JSON before calling this).
 */
export async function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string | null,
): Promise<boolean> {
  const key = await webhookSecret();
  if (!key || !hmacHeader) return false;
  const expected = createHmac("sha256", key).update(rawBody, "utf8").digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(hmacHeader, "base64");
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

const FULFILLMENT_TOPICS = ["FULFILLMENTS_CREATE", "FULFILLMENTS_UPDATE"] as const;

export interface WebhookRegistration {
  topic: string;
  ok: boolean;
  id?: string;
  alreadyExists?: boolean;
  errors?: unknown;
}

/** Subscribe fulfilment webhooks to our handler (idempotent). */
export async function registerShopifyWebhooks(
  callbackUrl: string,
): Promise<WebhookRegistration[]> {
  const existing = await listShopifyWebhooks();
  const out: WebhookRegistration[] = [];

  for (const topic of FULFILLMENT_TOPICS) {
    const already = (existing.webhooks ?? []).find(
      (w) => w.topic === topic && w.callbackUrl === callbackUrl,
    );
    if (already) {
      out.push({ topic, ok: true, id: already.id, alreadyExists: true });
      continue;
    }

    const r = await shopifyGraphql<{
      webhookSubscriptionCreate: {
        webhookSubscription: { id: string } | null;
        userErrors: { field: string[] | null; message: string }[];
      };
    }>(
      `mutation($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
          webhookSubscription { id }
          userErrors { field message }
        }
      }`,
      { topic, sub: { callbackUrl, format: "JSON" } },
    );

    const payload = r.data?.webhookSubscriptionCreate;
    const userErrors = payload?.userErrors ?? [];
    if (r.ok && payload?.webhookSubscription && userErrors.length === 0) {
      out.push({ topic, ok: true, id: payload.webhookSubscription.id });
    } else {
      out.push({ topic, ok: false, errors: userErrors.length ? userErrors : r.errors });
    }
  }
  return out;
}

export interface WebhookSummary {
  id: string;
  topic: string;
  callbackUrl: string | null;
}

export async function listShopifyWebhooks(): Promise<{
  ok: boolean;
  webhooks?: WebhookSummary[];
  errors?: unknown;
}> {
  const r = await shopifyGraphql<{
    webhookSubscriptions: {
      edges: {
        node: {
          id: string;
          topic: string;
          endpoint: { __typename: string; callbackUrl?: string };
        };
      }[];
    };
  }>(`{
    webhookSubscriptions(first: 50) {
      edges {
        node {
          id
          topic
          endpoint {
            __typename
            ... on WebhookHttpEndpoint { callbackUrl }
          }
        }
      }
    }
  }`);
  if (!r.ok) return { ok: false, errors: r.errors };
  return {
    ok: true,
    webhooks: (r.data?.webhookSubscriptions.edges ?? []).map(({ node }) => ({
      id: node.id,
      topic: node.topic,
      callbackUrl: node.endpoint?.callbackUrl ?? null,
    })),
  };
}

export interface ShopifyOrderRef {
  id: string;
  name: string;
  note: string | null;
  createdAt: string;
}

export async function listShopifyOrderRefs(): Promise<{
  ok: boolean;
  refs?: ShopifyOrderRef[];
  errors?: unknown;
}> {
  const r = await shopifyGraphql<{
    orders: { edges: { node: ShopifyOrderRef }[] };
  }>(`{
    orders(first: 250, reverse: true) {
      edges { node { id name note createdAt } }
    }
  }`);
  if (!r.ok) return { ok: false, errors: r.errors };
  return { ok: true, refs: (r.data?.orders.edges ?? []).map((e) => e.node) };
}

export interface ShopifyTracking {
  orderId: string;
  orderName: string;
  note: string | null;
  number: string;
  url: string | null;
  company: string | null;
}

export async function listShopifyOrderTracking(): Promise<{
  ok: boolean;
  tracking?: ShopifyTracking[];
  errors?: unknown;
}> {
  const r = await shopifyGraphql<{
    orders: {
      edges: {
        node: {
          id: string;
          name: string;
          note: string | null;
          fulfillments: {
            status: string;
            trackingInfo: {
              company: string | null;
              number: string | null;
              url: string | null;
            }[];
          }[];
        };
      }[];
    };
  }>(`{
    orders(first: 100, reverse: true) {
      edges {
        node {
          id
          name
          note
          fulfillments(first: 10) {
            status
            trackingInfo(first: 5) { company number url }
          }
        }
      }
    }
  }`);
  if (!r.ok) return { ok: false, errors: r.errors };

  const tracking: ShopifyTracking[] = [];
  for (const { node } of r.data?.orders.edges ?? []) {
    for (const f of node.fulfillments ?? []) {
      if ((f.status ?? "").toUpperCase() === "CANCELLED") continue;
      const info = (f.trackingInfo ?? []).find((t) => t.number?.trim());
      if (!info?.number) continue;
      tracking.push({
        orderId: node.id,
        orderName: node.name,
        note: node.note,
        number: info.number.trim(),
        url: info.url?.trim() || null,
        company: info.company?.trim() || null,
      });
      break;
    }
  }
  return { ok: true, tracking };
}

/** Payment reference inside a mirrored order note — matches `webshop <ref>`. */
export function referenceFromNote(note: string | null): string | null {
  if (!note) return null;
  return /webshop\s+(\S+)/i.exec(note)?.[1] ?? null;
}

export async function getShopifyOrderReference(
  orderGid: string,
): Promise<string | null> {
  const r = await shopifyGraphql<{ order: { note: string | null } | null }>(
    `query($id: ID!) { order(id: $id) { note } }`,
    { id: orderGid },
  );
  return referenceFromNote(r.data?.order?.note ?? null);
}
