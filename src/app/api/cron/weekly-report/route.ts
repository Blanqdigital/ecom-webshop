import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import { COMPANY } from "@/lib/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Weekly store report → Telegram. Covers the trailing 7 days (so a Friday run
 * spans Friday→Friday): visitors, add-to-carts, checkouts started, paid orders
 * and revenue. Triggered by a scheduled GitHub Action every Friday morning;
 * calling it manually sends the same report immediately (useful as a test).
 * Guarded by CRON_SECRET, same as the abandoned-cart cron.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false; // fail closed until configured
  const auth = req.headers.get("authorization") ?? "";
  const bearer = /^bearer /i.test(auth) ? auth.slice(7).trim() : "";
  const key = new URL(req.url).searchParams.get("key") ?? "";
  return bearer === secret || key === secret;
}

const fmtDay = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const money = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(Math.round(n));

const pct = (n: number, d: number) =>
  d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";

async function buildReport() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { error: "Database isn't configured." };

  const to = new Date();
  const from = new Date(to.getTime() - 7 * 86400000);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  // Raw page views (for context next to the visitor count).
  const pageViews = await (async (): Promise<number | null> => {
    const { count, error } = await supabase
      .from("funnel_events")
      .select("*", { count: "exact", head: true })
      .eq("name", "PageView")
      .gte("created_at", fromIso)
      .lt("created_at", toIso);
    return error ? null : (count ?? 0);
  })();

  // Funnel stages as UNIQUE VISITORS (distinct visitor_id), matching the admin
  // funnel — raw event counts let reloads/retries push "checkouts" above
  // "add-to-carts". Row fetch capped by PostgREST; ample at current volumes.
  const distinctVisitors = async (name: string): Promise<number | null> => {
    const { data, error } = await supabase
      .from("funnel_events")
      .select("visitor_id")
      .eq("name", name)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .limit(10000);
    if (error || !data) return null;
    return new Set(data.map((r) => r.visitor_id).filter(Boolean)).size;
  };
  const [visitors, addToCarts, checkouts] = await Promise.all([
    distinctVisitors("PageView"),
    distinctVisitors("AddToCart"),
    distinctVisitors("InitiateCheckout"),
  ]);

  // Paid orders + revenue.
  let orders = 0;
  let revenue = 0;
  {
    const { data, error } = await supabase
      .from("orders")
      .select("amount_total,payment_status")
      .gte("created_at", fromIso)
      .lt("created_at", toIso);
    if (error) return { error: `orders query: ${error.message}` };
    for (const o of data ?? []) {
      if ((o.payment_status ?? "").toLowerCase() !== "paid") continue;
      orders += 1;
      revenue += Number(o.amount_total) || 0;
    }
  }

  const n = (v: number | null) => (v == null ? "—" : String(v));
  const convBase = visitors ?? pageViews ?? 0;

  const text = [
    `📊 <b>Butikk — Weekly report</b>`,
    `${fmtDay.format(from)} → ${fmtDay.format(to)}`,
    ``,
    `👀 Visitors: <b>${n(visitors)}</b> (${n(pageViews)} page views)`,
    `🛒 Added to cart: <b>${n(addToCarts)}</b>`,
    `💳 Checkouts started: <b>${n(checkouts)}</b>`,
    `✅ Orders: <b>${orders}</b>`,
    `💰 Revenue: <b>${money(revenue)}</b>`,
    ``,
    `Visit → purchase: ${pct(orders, convBase)}`,
    `<a href="${COMPANY.url}/admin">Open admin</a>`,
  ].join("\n");

  return {
    text,
    stats: { visitors, pageViews, addToCarts, checkouts, orders, revenue },
  };
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const report = await buildReport();
  if ("error" in report) {
    return NextResponse.json(report, { status: 500 });
  }
  const sent = await sendTelegramMessage(report.text);
  return NextResponse.json({ ...sent, stats: report.stats });
}

export const POST = GET;
