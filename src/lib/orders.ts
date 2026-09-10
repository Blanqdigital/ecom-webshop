import { getSupabaseAdmin } from "./supabase";
import { sendOrderEmails } from "./email";
import { sendTelegramOrder } from "./telegram";
import { createShopifyOrder } from "./shopify";
import { markCartConverted } from "./abandoned";

// Shared order-recording pipeline. Both the Stripe webhook and the Vipps flow
// normalise their provider payload into an OrderInput and call recordOrder().
// Persist before downstream effects; failures propagate so providers retry.

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
  if (!supabase) throw new Error("Order database is not configured");
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

  // The unique provider reference arbitrates concurrent webhook deliveries.
  // Ignore duplicate inserts instead of a racy read-then-upsert check.
  const { data: inserted, error } = await supabase.from("orders")
    .upsert(order, { onConflict: "stripe_session_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error("Order persistence failed; payment provider must retry");
  let isNew = (inserted?.length ?? 0) > 0;
  if (!isNew && order.payment_status === "paid") {
    const { data: transitioned, error: transitionError } = await supabase.from("orders")
      .update(order).eq("stripe_session_id", o.id).neq("payment_status", "paid").select("id");
    if (transitionError) throw new Error("Order payment transition failed");
    isNew = (transitioned?.length ?? 0) > 0;
  }

  // A paid order clears any pending abandoned-checkout reminder for this email
  // (idempotent, so safe on webhook re-delivery).
  if (order.payment_status === "paid") {
    await markCartConverted(order.email);
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

function safeParse(v: string | undefined) {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
