import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  getShopifyOrderReference,
  shopifyWebhookConfigured,
  verifyShopifyWebhook,
} from "@/lib/shopify";
import { sendShippedEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FulfillmentPayload {
  id?: number;
  order_id?: number;
  status?: string;
  tracking_number?: string | null;
  tracking_numbers?: string[] | null;
  tracking_url?: string | null;
  tracking_urls?: string[] | null;
  tracking_company?: string | null;
}

interface OrderRow {
  id: string;
  stripe_session_id: string;
  email: string | null;
  customer_name: string | null;
  items: unknown;
  locale: string | null;
  tracking_number: string | null;
  shipped_email_sent_at: string | null;
}

const SELECT =
  "id,stripe_session_id,email,customer_name,items,locale,tracking_number,shipped_email_sent_at";

export async function POST(req: Request) {
  if (!(await shopifyWebhookConfigured())) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const raw = await req.text();
  if (!(await verifyShopifyWebhook(raw, req.headers.get("x-shopify-hmac-sha256")))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const topic = req.headers.get("x-shopify-topic") ?? "";
  if (!topic.startsWith("fulfillments/")) {
    return NextResponse.json({ ok: true, ignored: topic });
  }

  let payload: FulfillmentPayload;
  try {
    payload = JSON.parse(raw) as FulfillmentPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.status && payload.status.toLowerCase() === "cancelled") {
    return NextResponse.json({ ok: true, ignored: "cancelled fulfillment" });
  }

  const trackingNumber =
    payload.tracking_number?.trim() || payload.tracking_numbers?.[0]?.trim() || "";
  const trackingUrl =
    payload.tracking_url?.trim() || payload.tracking_urls?.[0]?.trim() || null;
  const trackingCompany = payload.tracking_company?.trim() || null;

  if (!payload.order_id) {
    return NextResponse.json({ ok: true, ignored: "no order_id" });
  }
  if (!trackingNumber) {
    return NextResponse.json({ ok: true, ignored: "no tracking number yet" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database isn't configured." }, { status: 503 });
  }

  const orderGid = `gid://shopify/Order/${payload.order_id}`;

  let order: OrderRow | null = null;
  const { data: byId } = await supabase
    .from("orders")
    .select(SELECT)
    .eq("shopify_order_id", orderGid)
    .maybeSingle();
  order = (byId as OrderRow | null) ?? null;

  if (!order) {
    const reference = await getShopifyOrderReference(orderGid);
    if (reference) {
      const { data: byRef } = await supabase
        .from("orders")
        .select(SELECT)
        .eq("stripe_session_id", reference)
        .maybeSingle();
      order = (byRef as OrderRow | null) ?? null;
      if (order) {
        await supabase
          .from("orders")
          .update({ shopify_order_id: orderGid })
          .eq("id", order.id);
      }
    }
  }

  if (!order) {
    console.warn("[shopify-webhook] no matching order for", orderGid);
    return NextResponse.json({ ok: true, ignored: "no matching order" });
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      tracking_number: trackingNumber,
      tracking_url: trackingUrl,
      tracking_company: trackingCompany,
      fulfillment_status: "shipped",
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);
  if (updateError) {
    console.error("[shopify-webhook] update failed:", updateError.message);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!order.email) {
    return NextResponse.json({ ok: true, tracked: true, emailed: false });
  }

  const { data: claimed } = await supabase
    .from("orders")
    .update({ shipped_email_sent_at: new Date().toISOString() })
    .eq("id", order.id)
    .is("shipped_email_sent_at", null)
    .select("id");
  if (!claimed?.length) {
    return NextResponse.json({ ok: true, tracked: true, emailed: false });
  }

  const sent = await sendShippedEmail({
    reference: order.stripe_session_id,
    email: order.email,
    name: order.customer_name,
    items: Array.isArray(order.items)
      ? (order.items as { slug?: string; colorId?: string; qty?: number }[])
      : null,
    trackingNumber,
    trackingUrl,
    trackingCompany,
  });

  if (!sent.ok) {
    await supabase
      .from("orders")
      .update({ shipped_email_sent_at: null })
      .eq("id", order.id);
    console.error("[shopify-webhook] shipped email failed:", sent.error);
  }

  return NextResponse.json({ ok: true, tracked: true, emailed: sent.ok });
}
