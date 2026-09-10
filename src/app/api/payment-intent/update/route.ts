import { COMMERCE } from "@/lib/commerce";
import { getSupabaseAdmin as orderDatabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { priceCart, parseBump, PricingError } from "@/lib/pricing";
import { findValidCoupon, discountOre } from "@/lib/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!COMMERCE.checkoutEnabled || !orderDatabase()) return NextResponse.json({ error: "Butikken er ikke åpen for bestilling ennå." }, { status: 503 });
  let stripe;
  try {
    stripe = await getStripe();
  } catch {
    return NextResponse.json(
      { error: "Betaling er ikke konfigurert." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const id =
    typeof body?.paymentIntentId === "string" ? body.paymentIntentId : null;
  if (!id) {
    return NextResponse.json({ error: "Mangler betalings-id." }, { status: 400 });
  }

  let priced;
  try {
    priced = priceCart(
      Array.isArray(body?.items) ? body.items : [],
      parseBump(body?.bump),
    );
  } catch (e) {
    const err = e as PricingError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 400 });
  }

  let amountOre = priced.amountOre;
  let couponCode: string | undefined;
  const coupon = await findValidCoupon(body?.coupon);
  if (coupon) {
    amountOre = discountOre(amountOre, coupon.percent_off);
    couponCode = coupon.code;
    if (amountOre === 0) return NextResponse.json({ free: true });
    if (amountOre < 300) amountOre = 300;
  }

  try {
    await stripe.paymentIntents.update(id, {
      amount: amountOre,
      metadata: {
        cart: JSON.stringify(priced.cartMeta).slice(0, 480),
        ...(couponCode ? { coupon: couponCode } : {}),
      },
    });
  } catch (err) {
    console.error("[payment-intent/update] failed:", err);
    return NextResponse.json(
      { error: "Kunne ikke oppdatere beløp. Prøv igjen." },
      { status: 502 },
    );
  }

  return NextResponse.json({ amount: amountOre / 100 });
}
