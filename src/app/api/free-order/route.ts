import { COMMERCE } from "@/lib/commerce";
import { getSupabaseAdmin as orderDatabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { priceCart, parseBump, PricingError } from "@/lib/pricing";
import { findValidCoupon, discountOre } from "@/lib/coupons";
import { recordOrder } from "@/lib/orders";
import { isEmail } from "@/lib/abandoned";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Completes an order whose total is 0 after a 100% coupon — Stripe/Vipps can't
 * process a zero charge, so this records the order directly (same pipeline:
 * DB, emails, Telegram, Shopify sync) and the client redirects to /takk.
 * The coupon and the price are ALWAYS re-validated server-side; the route
 * refuses anything that still costs money.
 */
export async function POST(req: Request) {
  if (!COMMERCE.checkoutEnabled || !orderDatabase()) return NextResponse.json({ error: "Butikken er ikke åpen for bestilling ennå." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as {
    items?: unknown;
    bump?: unknown;
    coupon?: unknown;
    customer?: {
      name?: unknown;
      email?: unknown;
      phone?: unknown;
      line1?: unknown;
      postal?: unknown;
      city?: unknown;
    };
  } | null;

  let priced;
  try {
    priced = priceCart(
      Array.isArray(body?.items) ? (body.items as never[]) : [],
      parseBump(body?.bump),
    );
  } catch (e) {
    const err = e as PricingError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 400 });
  }

  const coupon = await findValidCoupon(body?.coupon);
  if (!coupon || discountOre(priced.amountOre, coupon.percent_off) > 0) {
    return NextResponse.json(
      { error: "Denne bestillingen er ikke gratis — bruk vanlig betaling." },
      { status: 400 },
    );
  }

  const c = body?.customer ?? {};
  const str = (v: unknown, max = 120) =>
    typeof v === "string" ? v.trim().slice(0, max) : "";
  const name = str(c.name);
  const email = str(c.email, 254);
  if (!name || !isEmail(email)) {
    return NextResponse.json(
      { error: "Navn og gyldig e-post er påkrevd." },
      { status: 400 },
    );
  }
  const line1 = str(c.line1, 200);
  const postal = str(c.postal, 12);
  const city = str(c.city, 80);
  if (!line1 || !postal || !city) {
    return NextResponse.json(
      { error: "Leveringsadresse er påkrevd." },
      { status: 400 },
    );
  }

  const reference = `free-${randomUUID()}`;
  await recordOrder({
    id: reference,
    email,
    name,
    phone: str(c.phone, 40) || null,
    amountTotal: 0,
    currency: "NOK",
    paymentStatus: "paid",
    address: { line1, postal_code: postal, city, country: "NO" },
    cart: JSON.stringify(
      priced.cartMeta.map((i) => ({ ...i, coupon: coupon.code })),
    ).slice(0, 480),
    method: `coupon ${coupon.code}`,
  });

  return NextResponse.json({ ok: true, reference });
}
