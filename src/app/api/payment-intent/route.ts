import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { priceCart, parseBump, PricingError } from "@/lib/pricing";
import { findValidCoupon, discountOre } from "@/lib/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Creates a PaymentIntent for the custom (Payment Element) checkout. Prices and
 * the BOGO allowance are computed from the SERVER catalogue (see lib/pricing);
 * client amounts are never trusted.
 */
export async function POST(req: Request) {
  let stripe;
  try {
    stripe = await getStripe();
  } catch {
    return NextResponse.json(
      { error: "Betaling er ikke konfigurert ennå." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const bump = parseBump(body?.bump);

  let priced;
  try {
    priced = priceCart(Array.isArray(body?.items) ? body.items : [], bump);
  } catch (e) {
    const err = e as PricingError;
    return NextResponse.json(
      { error: err.message },
      { status: err.status ?? 400 },
    );
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

  let intent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: amountOre,
      currency: "nok",
      automatic_payment_methods: { enabled: true },
      metadata: {
        cart: JSON.stringify(priced.cartMeta).slice(0, 480),
        ...(couponCode ? { coupon: couponCode } : {}),
      },
    });
  } catch (err) {
    console.error("[payment-intent] create failed:", err);
    return NextResponse.json(
      { error: "Kunne ikke starte betaling. Prøv igjen senere." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    amount: amountOre / 100,
  });
}
