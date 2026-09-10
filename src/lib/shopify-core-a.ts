// Shopify Admin API (GraphQL). Pushes paid web orders into a Shopify store so
// a dropship supplier (e.g. TeamDrop) can fulfil them. No-ops until BOTH
// shopify_admin_token and shopify_store_domain are set (env or Admin →
// Integrations). The token is a custom-app Admin API token (write_orders,
// read_products) — server-only, never exposed to the client.
//
// PER-STORE: fill SHOPIFY_VARIANT_MAP below for the product imported into the
// new Shopify store. Verify variants by IMAGE, not by name — supplier variant
// names are often wrong.

import { getProduct } from "./products";
import { bumpUnitPriceNok } from "./offers";
import { getIntegration } from "./integrations";

import { SHOPIFY_API_VERSION as API_VERSION, validShopifyDomain } from "./shopify-config";

async function shopDomain(): Promise<string> {
  const domain = (await getIntegration("shopify_store_domain")).trim();
  if (!validShopifyDomain(domain)) throw new Error("Use the exact myshopify.com store domain");
  return domain;
}

export async function shopifyConfigured(): Promise<boolean> {
  const token = (await getIntegration("shopify_admin_token")).trim();
  return !!token && !!(await shopDomain());
}

interface GqlResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  errors?: unknown;
}

export async function shopifyGraphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<GqlResult<T>> {
  const token = (await getIntegration("shopify_admin_token")).trim();
  if (!token) {
    return { ok: false, status: 0, errors: "SHOPIFY_ADMIN_TOKEN not set" };
  }
  try {
    const res = await fetch(
      `https://${await shopDomain()}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
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
      status: res.status,
      data: json.data,
      errors: json.errors,
    };
  } catch (err) {
    return { ok: false, status: 0, errors: (err as Error).message };
  }
}

/**
 * PER-STORE: webshop colour id (src/lib/products.ts) → Shopify variant GID.
 * Fill this after the product is imported into the fulfilment store (read the
 * GIDs with the ?shopify=catalog diagnostic) and VERIFY EACH VARIANT BY IMAGE
 * — supplier variant names lie. While the map is empty (or a colour is
 * missing), orders are skipped (logged) rather than synced half-wrong.
 */
export const SHOPIFY_VARIANT_MAP: Record<string, string> = {
  // colorId: "gid://shopify/ProductVariant/<fill-after-import>",
};

export interface ShopifyOrderInput {
  /** Stripe/Vipps reference — used for the order note + idempotency tag. */
  reference: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  amountTotal: number | null;
  currency: string;
  address: {
    line1?: string | null;
    line2?: string | null;
    postal_code?: string | null;
    city?: string | null;
    country?: string | null;
  } | null;
  items: {
    slug?: string;
    colorId?: string;
    qty?: number;
    bump?: boolean;
    free?: boolean;
  }[];
}

export interface ShopifySyncResult {
  ok: boolean;
  orderId?: string;
  orderName?: string;
  skipped?: string;
  errors?: unknown;
}

/**
 * Create a paid order in the fulfilment Shopify so the supplier ships it.
 * Customer notifications are OFF (the webshop already confirmed the order);
 * the order is tagged `webshop` and carries the payment reference in its note.
 */
export async function createShopifyOrder(
  o: ShopifyOrderInput,
): Promise<ShopifySyncResult> {
  if (!(await shopifyConfigured())) {
    return { ok: false, skipped: "SHOPIFY_ADMIN_TOKEN not set" };
  }
  if (Object.keys(SHOPIFY_VARIANT_MAP).length === 0) {
    return { ok: false, skipped: "variant map empty (sling not mapped yet)" };
  }

  const currency = (o.currency || "NOK").toUpperCase();

  const grouped = new Map<string, { quantity: number; revenue: number }>();
  for (const it of o.items) {
    const variantId = SHOPIFY_VARIANT_MAP[it.colorId ?? ""];
    if (!variantId) {
      return { ok: false, skipped: `no variant mapping for colour "${it.colorId}"` };
    }
    const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
    const unitPrice = it.free
      ? 0
      : it.bump
        ? bumpUnitPriceNok()
        : (getProduct(it.slug ?? "")?.priceNok ?? 0);
    const g = grouped.get(variantId) ?? { quantity: 0, revenue: 0 };
    g.quantity += qty;
    g.revenue += unitPrice * qty;
    grouped.set(variantId, g);
  }
  const expected = [...grouped.values()].reduce((s, g) => s + g.revenue, 0);
  const paidTotal = o.amountTotal;
  if (paidTotal != null && expected > 0 && Math.abs(expected - paidTotal) > 0.005) {
    const factor = paidTotal / expected;
    for (const g of grouped.values()) g.revenue *= factor;
  }

  const lineItems = [...grouped.entries()].map(([variantId, g]) => ({
    variantId,
    quantity: g.quantity,
    priceSet: {
      shopMoney: {
        amount: (g.revenue / g.quantity).toFixed(2),
        currencyCode: currency,
      },
    },
  }));
  if (lineItems.length === 0) return { ok: false, skipped: "no line items" };

  if (paidTotal != null && lineItems.length > 0) {
    const sum = lineItems.reduce(
      (s, li) => s + Number(li.priceSet.shopMoney.amount) * li.quantity,
      0,
    );
    const drift = Math.round((paidTotal - sum) * 100) / 100;
    if (drift !== 0) {
      const single = lineItems.find((li) => li.quantity === 1);
      if (single) {
        single.priceSet.shopMoney.amount = (
          Number(single.priceSet.shopMoney.amount) + drift
        ).toFixed(2);
      }
    }
  }

  const nameParts = (o.name ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "Kunde";
  const lastName = nameParts.slice(1).join(" ") || firstName;
  const shippingAddress = o.address
    ? {
        address1: o.address.line1 ?? undefined,
        address2: o.address.line2 ?? undefined,
        city: o.address.city ?? undefined,
        zip: o.address.postal_code ?? undefined,
        countryCode: o.address.country?.toUpperCase() || "NO",
        firstName,
        lastName,
        phone: o.phone ?? undefined,
      }
    : undefined;

  const amount = (o.amountTotal ?? 0).toFixed(2);

  const r = await shopifyGraphql<{
    orderCreate: {
      order: { id: string; name: string } | null;
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(
    `mutation orderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) {
        order { id name }
        userErrors { field message }
      }
    }`,
    {
      order: {
        currency,
        email: o.email ?? undefined,
        lineItems,
        shippingAddress,
        billingAddress: shippingAddress,
        note: `webshop ${o.reference} — customer paid ${amount} ${currency}`,
        tags: ["webshop"],
        transactions: [
          {
            kind: "SALE",
            status: "SUCCESS",
            gateway: "webshop (Stripe/Vipps)",
            amountSet: { shopMoney: { amount, currencyCode: currency } },
          },
        ],
      },
      options: {
        sendReceipt: false,
        sendFulfillmentReceipt: false,
        inventoryBehaviour: "DECREMENT_OBEYING_POLICY",
      },
    },
  );

  const payload = r.data?.orderCreate;
  if (r.ok && payload?.order && (payload.userErrors ?? []).length === 0) {
    return { ok: true, orderId: payload.order.id, orderName: payload.order.name };
  }
  const errors = payload?.userErrors?.length ? payload.userErrors : r.errors;
  console.error("[shopify] orderCreate failed:", JSON.stringify(errors));
  return { ok: false, errors };
}
