import { NextResponse } from "next/server";
import { authenticateAdmin, getSupabaseAdmin } from "@/lib/supabase";
import {
  listShopifyOrderRefs,
  listShopifyOrderTracking,
  referenceFromNote,
  shopifyConfigured,
} from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Supabase = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function updateOrder(
  supabase: Supabase,
  id: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  let { error } = await supabase.from("orders").update(payload).eq("id", id);
  if (error && /shopify_order_number/.test(error.message)) {
    const retry = { ...payload };
    delete retry.shopify_order_number;
    ({ error } = await supabase.from("orders").update(retry).eq("id", id));
  }
  return error ? error.message : null;
}

export async function POST(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!(await shopifyConfigured()))
    return NextResponse.json(
      { error: "SHOPIFY_ADMIN_TOKEN not set" },
      { status: 503 },
    );

  const supabase = getSupabaseAdmin();
  if (!supabase)
    return NextResponse.json(
      { error: "Database isn't configured." },
      { status: 503 },
    );

  const body = await req.json().catch(() => ({}));
  const overwrite = body?.overwrite === true;

  const [shopify, refs] = await Promise.all([
    listShopifyOrderTracking(),
    listShopifyOrderRefs(),
  ]);
  if (!shopify.ok)
    return NextResponse.json(
      { error: "Couldn't read Shopify.", details: shopify.errors },
      { status: 502 },
    );

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const byGid = new Map((shopify.tracking ?? []).map((t) => [t.orderId, t]));
  const byReference = new Map(
    (shopify.tracking ?? []).flatMap((t) => {
      const ref = referenceFromNote(t.note);
      return ref ? [[ref, t] as const] : [];
    }),
  );
  const refByGid = new Map((refs.refs ?? []).map((r) => [r.id, r]));
  const refByReference = new Map(
    (refs.refs ?? []).flatMap((r) => {
      const ref = referenceFromNote(r.note);
      return ref ? [[ref, r] as const] : [];
    }),
  );

  const updated: {
    order: string;
    customer: string | null;
    trackingNumber: string;
    carrier: string | null;
  }[] = [];
  const skipped: { order: string; reason: string }[] = [];
  let linked = 0;

  for (const o of orders ?? []) {
    const ref =
      (o.shopify_order_id ? refByGid.get(o.shopify_order_id) : undefined) ??
      refByReference.get(o.stripe_session_id);
    if (ref && (!o.shopify_order_id || !o.shopify_order_number)) {
      const err = await updateOrder(supabase, o.id, {
        shopify_order_id: ref.id,
        shopify_order_number: ref.name,
      });
      if (!err) linked++;
    }

    const match =
      (o.shopify_order_id ? byGid.get(o.shopify_order_id) : undefined) ??
      byReference.get(o.stripe_session_id);

    if (!match) {
      skipped.push({ order: o.stripe_session_id, reason: "no tracking in Shopify" });
      continue;
    }
    if (o.tracking_number && !overwrite) {
      skipped.push({ order: o.stripe_session_id, reason: "already has tracking" });
      continue;
    }

    const upErr = await updateOrder(supabase, o.id, {
      tracking_number: match.number,
      tracking_url: match.url,
      tracking_company: match.company,
      fulfillment_status: "shipped",
      shopify_order_id: match.orderId,
      shopify_order_number: match.orderName,
      updated_at: new Date().toISOString(),
    });
    if (upErr) {
      skipped.push({ order: o.stripe_session_id, reason: upErr });
      continue;
    }
    updated.push({
      order: o.stripe_session_id,
      customer: o.customer_name,
      trackingNumber: match.number,
      carrier: match.company,
    });
  }

  return NextResponse.json({
    ok: true,
    shopifyOrdersWithTracking: shopify.tracking?.length ?? 0,
    linked,
    updated,
    skipped,
  });
}
