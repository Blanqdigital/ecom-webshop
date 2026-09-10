import { getSupabaseAdmin } from "./supabase";
import { sendCapiPurchase } from "./capi";
import { sendOrderEmails } from "./email";
import { sendTelegramOrder } from "./telegram";
import { createShopifyOrder } from "./shopify";
import { markCartConverted } from "./abandoned";
import { PRODUCTS } from "./products";
import { SITE } from "./site";

// Shared order-recording pipeline. Both the Stripe webhook and the Vipps flow
// normalise their provider payload into an OrderInput and call recordOrder().
// It persists the order (dedup + upsert), fires the Meta CAPI Purchase, and
// sends the admin + customer emails — exactly once per order. The browser
// pixel on /takk fires the same Purchase with the same event id, so Meta
// dedupes the pair; the server copy is the one that survives closed tabs and
// ad blockers (re-added 2026-07-13 after purchase-optimized ads had zero
// attributable results).

/** Provider-agnostic delivery address (superset of Stripe.Address / Vipps). */
export interface OrderAddress {
  line1?: string | null;
  line2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface OrderInput {
  /** Unique order reference (Stripe id or Vipps reference) — the dedup key. */
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  amountTotal: number | null;
  currency: string;
  paymentStatus: string | null;
  address: OrderAddress | null;
  cart: string | undefined;
  /** "card" | "vipps" — surfaced in the admin email only (not persisted). */
  method?: string;
  /** Meta _fbp cookie, forwarded via checkout metadata. Improves CAPI match. */
  fbp?: string | null;
  /** Meta _fbc click id cookie, forwarded via checkout metadata. */
  fbc?: string | null;
}

/** Persist a paid order (when a DB is configured) and send notifications. */
export async function recordOrder(o: OrderInput) {
  const supabase = getSupabaseAdmin();
  const order = {
    stripe_session_id: o.id,
    email: o.email,
    customer_name: o.name,
    phone: o.phone,
    amount_total: o.amountTotal,
    currency: o.currency,
    payment_status: o.paymentStatus,
    shipping_address: o.address,
    items: safeParse(o.cart),
  };

  // Webhooks / return-URL finalisation can deliver more than once; only email
  // on the first sighting.
  let isNew = true;
  if (supabase) {
    const { data: existing } = await supabase
      .from("orders")
      .select("id")
      .eq("stripe_session_id", o.id)
      .maybeSingle();
    isNew = !existing;

    const { error } = await supabase
      .from("orders")
      .upsert(order, { onConflict: "stripe_session_id" });
    if (error) {
      console.error("[orders] insert failed:", error.message);
      // Swallow so the provider doesn't retry forever on a schema issue.
    }
  } else {
    console.log("[orders] paid order (no DB configured):", order);
  }

  // A paid order clears any pending abandoned-checkout reminder for this email
  // (idempotent, so safe on webhook re-delivery).
  if (order.payment_status === "paid") {
    await markCartConverted(order.email);
  }

  // Meta Conversions API: server-side Purchase, deduplicated with the browser
  // pixel via the order id as event_id. Only on the first sighting so webhook
  // retries never inflate the count. Best-effort — no-ops without a token.
  if (isNew && order.payment_status === "paid") {
    await sendCapiPurchase({
      eventId: o.id,
      value: order.amount_total ?? 0,
      currency: order.currency,
      contentIds: cartSlugs(order.items),
      eventSourceUrl: `${SITE.url}/takk`,
      user: {
        email: order.email,
        phone: order.phone,
        fbp: o.fbp,
        fbc: o.fbc,
      },
    });
  }

  // Notifications (admin email + customer confirmation + Telegram) — only on
  // the first sighting of a paid order, so retries never double-notify.
  if (isNew && order.payment_status === "paid") {
    const notification = {
      id: o.id,
      email: order.email,
      name: order.customer_name,
      amountTotal: order.amount_total,
      currency: order.currency,
      items: Array.isArray(order.items) ? order.items : null,
      address: o.address,
      phone: order.phone,
      method: o.method,
    };
    await sendOrderEmails(notification);
    await sendTelegramOrder(notification);

    // Fulfilment: mirror the paid order into the Shopify store. Only on first
    // sighting, so webhook retries can't create duplicate Shopify orders.
    // Best-effort — a sync failure never blocks the pipeline.
    const sync = await createShopifyOrder({
      reference: o.id,
      email: order.email,
      name: order.customer_name,
      phone: order.phone,
      amountTotal: order.amount_total,
      currency: order.currency,
      address: o.address,
      items: Array.isArray(order.items) ? order.items : [],
    });
    if (!sync.ok) {
      console.error("[shopify] order not synced:", JSON.stringify(sync));
    }

    if (supabase) {
      const meta: Record<string, unknown> = { locale: "nb" };
      if (sync.ok && sync.orderId) meta.shopify_order_id = sync.orderId;
      if (sync.ok && sync.orderName) meta.shopify_order_number = sync.orderName;
      let { error } = await supabase
        .from("orders")
        .update(meta)
        .eq("stripe_session_id", o.id);
      if (error && /shopify_order_number/.test(error.message)) {
        delete meta.shopify_order_number;
        ({ error } = await supabase
          .from("orders")
          .update(meta)
          .eq("stripe_session_id", o.id));
      }
      if (error) {
        console.error(
          "[orders] shipping metadata not stored (run supabase/schema.sql):",
          error.message,
        );
      }
    }
  }
}

/** Product slugs from the stored cart, for CAPI content_ids. */
function cartSlugs(items: unknown): string[] {
  const fallback = PRODUCTS[0]?.slug ? [PRODUCTS[0].slug] : [];
  if (!Array.isArray(items)) return fallback;
  const slugs = [
    ...new Set(
      items
        .map((i) =>
          i && typeof i === "object" ? (i as { slug?: string }).slug : null,
        )
        .filter((s): s is string => typeof s === "string"),
    ),
  ];
  return slugs.length ? slugs : fallback;
}

function safeParse(v: string | undefined) {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
