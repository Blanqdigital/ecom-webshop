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

const API_VERSION = "2024-10";

async function shopDomain(): Promise<string> {
  return (await getIntegration("shopify_store_domain")).trim();
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

  // Each line carries the price the customer ACTUALLY paid on the webshop
  // (BOGO/free item → 0, order bump → its discounted price, else catalogue
  // price). Without the override Shopify prices every line at the variant's
  // full price, so a paid BOGO order showed a phantom outstanding balance.
  //
  // Same-variant lines are GROUPED (qty summed, revenue averaged per unit):
  // Shopify collapses duplicate-variant lines and silently dropped the 0.00
  // one, which would have lost the freebie on a same-colour BOGO.
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
  // Reconcile against the real payment: older/backfilled orders don't carry
  // free/bump flags on their items, so the flag-derived sum can exceed what
  // the customer paid (e.g. BOGO stored as two full-price lines). Scale all
  // line revenues so they add up to amountTotal exactly — the Shopify order
  // then always shows fully PAID, whatever shape the discount had.
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

  // toFixed rounding can drift a few øre off the paid total; absorb the
  // difference in a qty-1 line so the sum matches to the øre.
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

/**
 * Products + variants (id, title, sku, option values) — for building the
 * colour→variant map and for the guarded catalog diagnostic.
 */
export async function listShopifyCatalog() {
  return shopifyGraphql<{
    products: {
      edges: {
        node: {
          id: string;
          title: string;
          handle: string;
          status: string;
          variants: {
            edges: {
              node: {
                id: string;
                title: string;
                sku: string | null;
                selectedOptions: { name: string; value: string }[];
                image: { url: string } | null;
              };
            }[];
          };
        };
      }[];
    };
  }>(`{
    products(first: 25) {
      edges {
        node {
          id
          title
          handle
          status
          variants(first: 40) {
            edges {
              node {
                id
                title
                sku
                selectedOptions { name value }
                image { url }
              }
            }
          }
        }
      }
    }
  }`);
}

export interface ShopifyOrderSummary {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFulfillmentStatus: string;
  displayFinancialStatus: string;
  note: string | null;
  tags: string[];
  customer: string | null;
  lineItems: { title: string; variantTitle: string | null; quantity: number }[];
}

/** All orders in the fulfilment store, newest first (for the ops diagnostic). */
export async function listShopifyOrders(): Promise<{
  ok: boolean;
  orders?: ShopifyOrderSummary[];
  errors?: unknown;
}> {
  const res = await shopifyGraphql<{
    orders: {
      edges: {
        node: {
          id: string;
          name: string;
          createdAt: string;
          cancelledAt: string | null;
          displayFulfillmentStatus: string;
          displayFinancialStatus: string;
          note: string | null;
          tags: string[];
          customer: { displayName: string } | null;
          lineItems: {
            edges: {
              node: {
                title: string;
                variantTitle: string | null;
                quantity: number;
              };
            }[];
          };
        };
      }[];
    };
  }>(`{
    orders(first: 50, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          cancelledAt
          displayFulfillmentStatus
          displayFinancialStatus
          note
          tags
          customer { displayName }
          lineItems(first: 10) {
            edges { node { title variantTitle quantity } }
          }
        }
      }
    }
  }`);
  if (!res.ok) return { ok: false, errors: res.errors };
  return {
    ok: true,
    orders: (res.data?.orders.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name,
      createdAt: node.createdAt,
      cancelledAt: node.cancelledAt,
      displayFulfillmentStatus: node.displayFulfillmentStatus,
      displayFinancialStatus: node.displayFinancialStatus,
      note: node.note,
      tags: node.tags,
      customer: node.customer?.displayName ?? null,
      lineItems: (node.lineItems.edges ?? []).map((e) => e.node),
    })),
  };
}

/**
 * Cancel + delete an order in the fulfilment store (used when re-syncing after
 * a variant-map fix). Orders must be cancelled before Shopify allows deletion;
 * cancellation is refund-free (manual gateway) and never notifies the customer
 * (the webshop owns all customer communication). Returns per-step results.
 */
export async function deleteShopifyOrder(orderGid: string): Promise<{
  ok: boolean;
  cancelled?: boolean;
  deletedId?: string | null;
  errors?: unknown;
}> {
  const del = () =>
    shopifyGraphql<{
      orderDelete: { deletedId: string | null; userErrors: { message: string }[] };
    }>(
      `mutation($orderId: ID!) { orderDelete(orderId: $orderId) { deletedId userErrors { message } } }`,
      { orderId: orderGid },
    );

  // Try a straight delete first (already-cancelled orders).
  let res = await del();
  if (res.data?.orderDelete?.deletedId) {
    return { ok: true, cancelled: false, deletedId: res.data.orderDelete.deletedId };
  }

  // Cancel, then retry the delete a few times (cancellation runs as a job).
  const cancel = await shopifyGraphql<{
    orderCancel: { userErrors: { message: string }[] };
  }>(
    `mutation($orderId: ID!) {
      orderCancel(orderId: $orderId, reason: OTHER, refund: false, restock: false, notifyCustomer: false) {
        userErrors { message }
      }
    }`,
    { orderId: orderGid },
  );
  const cancelErrors = cancel.data?.orderCancel?.userErrors ?? [];
  if (!cancel.ok || cancelErrors.length > 0) {
    return { ok: false, errors: cancel.errors ?? cancelErrors };
  }

  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await del();
    if (res.data?.orderDelete?.deletedId) {
      return { ok: true, cancelled: true, deletedId: res.data.orderDelete.deletedId };
    }
  }
  return {
    ok: false,
    cancelled: true,
    errors: res.data?.orderDelete?.userErrors ?? res.errors,
  };
}
