import { NextResponse } from "next/server";
import { getSupabaseAdmin, authenticateAdmin } from "@/lib/supabase";
import {
  createShopifyOrder,
  listShopifyOrderRefs,
  referenceFromNote,
  shopifyConfigured,
} from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SINCE_DAYS = 7;

interface CandidateRow {
  stripe_session_id: string;
  email: string | null;
  customer_name: string | null;
  phone: string | null;
  amount_total: number | null;
  currency: string | null;
  shipping_address: Record<string, string | null> | null;
  items: unknown;
  created_at: string;
  shopify_order_id: string | null;
}

async function candidates() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { error: "Database isn't configured.", rows: [] };
  const since = new Date(Date.now() - SINCE_DAYS * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "stripe_session_id, email, customer_name, phone, amount_total, currency, shipping_address, items, created_at, shopify_order_id",
    )
    .eq("payment_status", "paid")
    .is("tracking_number", null)
    .is("shopify_order_id", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (error) return { error: error.message, rows: [] };

  const refs = await listShopifyOrderRefs();
  if (!refs.ok)
    return {
      error: `Couldn't read the Shopify store: ${JSON.stringify(refs.errors)}`,
      rows: [],
    };
  const inStoreRefs = new Set(
    (refs.refs ?? [])
      .map((r) => referenceFromNote(r.note))
      .filter(Boolean) as string[],
  );

  const rows = ((data ?? []) as CandidateRow[]).filter(
    (r) => !inStoreRefs.has(r.stripe_session_id),
  );
  return { rows };
}

export async function GET(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await shopifyConfigured()))
    return NextResponse.json(
      { error: "SHOPIFY_ADMIN_TOKEN not set" },
      { status: 503 },
    );

  const { rows, error } = await candidates();
  if (error) return NextResponse.json({ error }, { status: 503 });
  return NextResponse.json({
    count: rows.length,
    orders: rows.map((r) => ({
      reference: r.stripe_session_id,
      created_at: r.created_at,
      amount_total: r.amount_total,
      currency: r.currency,
      email: r.email,
    })),
  });
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
  const { rows, error } = await candidates();
  if (error || !supabase)
    return NextResponse.json({ error }, { status: 503 });

  const results = [];
  for (const r of rows) {
    const sync = await createShopifyOrder({
      reference: r.stripe_session_id,
      email: r.email,
      name: r.customer_name,
      phone: r.phone,
      amountTotal: r.amount_total,
      currency: r.currency ?? "NOK",
      address: r.shipping_address,
      items: Array.isArray(r.items) ? r.items : [],
    });

    if (sync.ok && sync.orderId) {
      const { error: upErr } = await supabase
        .from("orders")
        .update({
          shopify_order_id: sync.orderId,
          shopify_order_number: sync.orderName,
          locale: "nb",
        })
        .eq("stripe_session_id", r.stripe_session_id);
      results.push({
        reference: r.stripe_session_id,
        ok: true,
        orderName: sync.orderName,
        dbUpdated: !upErr,
      });
    } else {
      results.push({
        reference: r.stripe_session_id,
        ok: false,
        skipped: sync.skipped,
        errors: sync.errors,
      });
    }
  }

  return NextResponse.json({ ok: results.every((r) => r.ok), results });
}
