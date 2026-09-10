import { shopifyGraphql } from "./shopify-core-a";

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

  let res = await del();
  if (res.data?.orderDelete?.deletedId) {
    return { ok: true, cancelled: false, deletedId: res.data.orderDelete.deletedId };
  }

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
