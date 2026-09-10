import { NextResponse } from "next/server";
import { isEmail } from "@/lib/abandoned";
import { sendOrderEmails } from "@/lib/email";
import { sendTelegramOrder } from "@/lib/telegram";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { recordOrder } from "@/lib/orders";
import { COMPANY } from "@/lib/company";
import {
  listShopifyCatalog,
  listShopifyOrders,
  deleteShopifyOrder,
  shopifyConfigured,
  createShopifyOrder,
  SHOPIFY_VARIANT_MAP,
} from "@/lib/shopify";
import { authorized, run, sweep, testSend } from "./runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const tg = url.searchParams.get("telegram");

  if (url.searchParams.get("shopify") === "orders") {
    return NextResponse.json(await listShopifyOrders());
  }

  if (url.searchParams.get("shopify") === "delete") {
    const raw = url.searchParams.get("id") ?? "";
    if (!raw) return NextResponse.json({ error: "pass ?id=…" }, { status: 400 });
    const gid = raw.startsWith("gid://") ? raw : `gid://shopify/Order/${raw}`;
    return NextResponse.json(await deleteShopifyOrder(gid));
  }

  if (url.searchParams.get("shopify") === "pushref") {
    const ref = url.searchParams.get("ref") ?? "";
    const supabase = getSupabaseAdmin();
    if (!ref || !supabase) {
      return NextResponse.json(
        { error: "pass ?ref=… (and DB required)" },
        { status: 400 },
      );
    }
    const { data: row, error } = await supabase
      .from("orders")
      .select("*")
      .eq("stripe_session_id", ref)
      .maybeSingle();
    if (error || !row) {
      return NextResponse.json(
        { error: error?.message ?? "order not found" },
        { status: 404 },
      );
    }
    if ((row.payment_status ?? "").toLowerCase() !== "paid") {
      return NextResponse.json({ skipped: `payment_status=${row.payment_status}` });
    }
    const r = await createShopifyOrder({
      reference: ref,
      email: row.email,
      name: row.customer_name,
      phone: row.phone,
      amountTotal: row.amount_total != null ? Number(row.amount_total) : null,
      currency: row.currency ?? "NOK",
      address: row.shipping_address,
      items: Array.isArray(row.items) ? row.items : [],
    });
    return NextResponse.json({ shopifyPushRef: ref, ...r });
  }

  if (url.searchParams.get("shopify") === "push") {
    const pi_id = url.searchParams.get("pi") ?? "";
    if (!/^pi_[A-Za-z0-9]+$/.test(pi_id)) {
      return NextResponse.json({ error: "pass ?pi=pi_…" }, { status: 400 });
    }
    try {
      const pi = await (await getStripe()).paymentIntents.retrieve(pi_id);
      if (pi.status !== "succeeded") {
        return NextResponse.json({ skipped: `status=${pi.status}` });
      }
      let items: { slug?: string; colorId?: string; qty?: number }[] = [];
      try {
        items = JSON.parse(pi.metadata?.cart ?? "[]");
      } catch {
        /* fall through to empty */
      }
      const r = await createShopifyOrder({
        reference: pi.id,
        email: pi.receipt_email ?? null,
        name: pi.shipping?.name ?? null,
        phone: pi.shipping?.phone ?? null,
        amountTotal: pi.amount != null ? pi.amount / 100 : null,
        currency: (pi.currency ?? "nok").toUpperCase(),
        address: pi.shipping?.address ?? null,
        items,
      });
      return NextResponse.json({ shopifyPush: pi_id, ...r });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  if (url.searchParams.get("shopify") === "testorder") {
    const colorId = Object.keys(SHOPIFY_VARIANT_MAP)[0];
    if (!colorId) {
      return NextResponse.json({ error: "variant map is empty — map the sling first" });
    }
    const r = await createShopifyOrder({
      reference: "shopify_sync_test",
      email: "hei@baera.shop",
      name: "Test Testesen",
      phone: "+47 400 00 000",
      amountTotal: 590,
      currency: "NOK",
      address: {
        line1: "Testveien 1",
        postal_code: "7655",
        city: "Verdal",
        country: "NO",
      },
      items: [
        { slug: "baereslyngen", colorId, qty: 1 },
        { slug: "baereslyngen", colorId, qty: 1, free: true },
      ],
    });
    return NextResponse.json({ shopifyTestOrder: true, colorId, ...r });
  }

  if (url.searchParams.get("shopify") === "catalog") {
    if (!(await shopifyConfigured())) {
      return NextResponse.json({ error: "SHOPIFY_ADMIN_TOKEN not set" });
    }
    const r = await listShopifyCatalog();
    const products = (r.data?.products.edges ?? []).map((p) => ({
      id: p.node.id,
      title: p.node.title,
      handle: p.node.handle,
      status: p.node.status,
      variants: p.node.variants.edges.map((v) => ({
        id: v.node.id,
        title: v.node.title,
        sku: v.node.sku,
        options: v.node.selectedOptions,
        image: v.node.image?.url ?? null,
      })),
    }));
    return NextResponse.json({ ok: r.ok, errors: r.errors ?? null, products });
  }

  const backfill = url.searchParams.get("backfill");
  if (backfill) {
    const ids = backfill
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^pi_[A-Za-z0-9]+$/.test(s))
      .slice(0, 10);
    const results: Record<string, unknown>[] = [];
    for (const id of ids) {
      try {
        const pi = await (await getStripe()).paymentIntents.retrieve(id);
        if (pi.status !== "succeeded") {
          results.push({ id, skipped: `status=${pi.status}` });
          continue;
        }
        await recordOrder({
          id: pi.id,
          email: pi.receipt_email ?? null,
          name: pi.shipping?.name ?? null,
          phone: pi.shipping?.phone ?? null,
          amountTotal: pi.amount != null ? pi.amount / 100 : null,
          currency: (pi.currency ?? "nok").toUpperCase(),
          paymentStatus: "paid",
          address: pi.shipping?.address ?? null,
          cart: pi.metadata?.cart,
          method: "card",
        });
        results.push({ id, recorded: true, email: pi.receipt_email });
      } catch (e) {
        results.push({ id, error: (e as Error).message });
      }
    }
    return NextResponse.json({ backfill: results });
  }

  if (url.searchParams.get("orders")) {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({
        ordersCount: null,
        note: "getSupabaseAdmin() returned null — SUPABASE_SERVICE_ROLE_KEY not set in this runtime",
      });
    }
    const { data, error, count } = await supabase
      .from("orders")
      .select("id,stripe_session_id,email,amount_total,payment_status,created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .limit(10);
    return NextResponse.json({
      ordersCount: count,
      dbError: error?.message ?? null,
      recent: data,
    });
  }

  if (tg === "updates") {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const configured = process.env.TELEGRAM_CHAT_ID ?? null;
    if (!token) {
      return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set", configured });
    }
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
      const d = (await r.json()) as {
        ok?: boolean;
        result?: Array<Record<string, { chat?: Record<string, unknown> }>>;
      };
      const seen = new Map<unknown, unknown>();
      for (const u of d.result ?? []) {
        const chat =
          u.message?.chat ?? u.channel_post?.chat ?? u.my_chat_member?.chat;
        if (chat && !seen.has(chat.id)) seen.set(chat.id, chat);
      }
      return NextResponse.json({
        botOk: d.ok,
        configured,
        chats: [...seen.values()],
      });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message, configured });
    }
  }

  if (url.searchParams.get("emails")) {
    const supabase = getSupabaseAdmin();
    const env = {
      RESEND_API_KEY: !!process.env.RESEND_API_KEY?.trim(),
      ORDER_FROM: process.env.ORDER_FROM?.trim() || "(unset → onboarding@resend.dev)",
      ORDER_NOTIFY_TO: process.env.ORDER_NOTIFY_TO?.trim() || "(unset → hei@baera.shop)",
    };
    if (!supabase) return NextResponse.json({ env, log: null });
    const { data, error } = await supabase
      .from("email_log")
      .select("type,recipient,subject,status,error,created_at")
      .order("created_at", { ascending: false })
      .limit(15);
    return NextResponse.json({
      env,
      logError: error?.message ?? null,
      log: data,
    });
  }

  const orderEmailParam = url.searchParams.get("orderemail");
  if (orderEmailParam) {
    const inbox = process.env.ORDER_NOTIFY_TO?.trim() || COMPANY.email;
    const customerTo = isEmail(orderEmailParam) ? orderEmailParam : inbox;
    await sendOrderEmails({
      id: "test_order_email",
      email: customerTo,
      name: "Test Testesen",
      amountTotal: 590,
      currency: "NOK",
      items: [
        { slug: "baereslyngen", colorId: "aztec", qty: 1 },
        { slug: "baereslyngen", colorId: "sort", qty: 1, bump: true },
      ],
      address: {
        line1: "Testveien 1",
        postal_code: "7655",
        city: "Verdal",
        country: "NO",
      },
      phone: "+47 400 00 000",
      method: "card",
    });
    return NextResponse.json({
      orderEmailTest: true,
      adminAlertTo: inbox,
      customerConfirmationTo: customerTo,
      note: "admin alert + customer confirmation sent; check the inbox + Marketing tab",
    });
  }

  if (tg) {
    const r = await sendTelegramOrder({
      id: "telegram_test",
      email: "test@baera.shop",
      name: "Test Testesen",
      amountTotal: 590,
      currency: "NOK",
      items: [{ slug: "baereslyngen", colorId: "aztec", qty: 1 }],
      address: {
        line1: "Testveien 1",
        postal_code: "7655",
        city: "Verdal",
        country: "NO",
      },
      phone: "+47 400 00 000",
      method: "card",
    });
    return NextResponse.json({ telegramTest: true, ...r });
  }

  if (url.searchParams.get("carts") === "1") {
    const supabase = getSupabaseAdmin();
    if (!supabase)
      return NextResponse.json({ error: "DB not configured" }, { status: 503 });
    const { data, error } = await supabase
      .from("abandoned_carts")
      .select(
        "email,subtotal,consent,reminder_sent_at,reminder2_sent_at,converted_at,created_at,updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(25);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const today = new Date().toISOString().slice(0, 10);
    return NextResponse.json({
      capturedToday: (data ?? []).filter((c) =>
        (c.updated_at ?? "").startsWith(today),
      ).length,
      carts: data,
    });
  }

  if (url.searchParams.get("funnel") === "1") {
    const supabase = getSupabaseAdmin();
    if (!supabase)
      return NextResponse.json({ error: "DB not configured" }, { status: 503 });
    const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
    const { data, error } = await supabase
      .from("funnel_events")
      .select("name,visitor_id,path,value,created_at")
      .gte("created_at", dayStart)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = data ?? [];
    const byStage: Record<string, number> = {};
    for (const r of rows) byStage[r.name] = (byStage[r.name] ?? 0) + 1;
    return NextResponse.json({
      today: byStage,
      uniqueVisitors: new Set(rows.map((r) => r.visitor_id)).size,
      events: rows.filter((r) => r.name !== "PageView"),
      pageViews: rows.filter((r) => r.name === "PageView").length,
    });
  }

  if (url.searchParams.get("sweep") === "1") {
    return NextResponse.json(await sweep(url.searchParams.get("dry") === "1"));
  }

  const test = url.searchParams.get("test");
  if (test) {
    if (!isEmail(test)) {
      return NextResponse.json({ error: "Invalid test email" }, { status: 400 });
    }
    return NextResponse.json(await testSend(test));
  }
  return NextResponse.json(await run());
}

export const POST = GET;
