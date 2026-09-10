import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { priceCart, parseBump, PricingError } from "@/lib/pricing";
import { findValidCoupon, discountOre } from "@/lib/coupons";
import { createVippsPayment, vippsConfigured } from "@/lib/vipps";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await vippsConfigured())) {
    return NextResponse.json(
      { error: "Vipps er ikke konfigurert ennå." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);

  let priced;
  try {
    priced = priceCart(
      Array.isArray(body?.items) ? body.items : [],
      parseBump(body?.bump),
    );
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
    if (amountOre === 0) {
      return NextResponse.json(
        { error: "Bestillingen er gratis — fullfør uten betaling." },
        { status: 400 },
      );
    }
    if (amountOre < 100) amountOre = 100;
  }

  const reference = `baera-${randomUUID()}`;
  const metadata: Record<string, string> = {
    cart: JSON.stringify(priced.cartMeta).slice(0, 480),
    ...(couponCode ? { coupon: couponCode } : {}),
  };

  try {
    const { redirectUrl } = await createVippsPayment({
      amountOre,
      reference,
      returnUrl: `${SITE.url}/takk?vipps=${encodeURIComponent(reference)}`,
      description: "Bæreslyngen",
      metadata,
    });
    return NextResponse.json({ redirectUrl });
  } catch (err) {
    console.error("[vipps/create] failed:", err);
    return NextResponse.json(
      { error: "Kunne ikke starte Vipps-betaling. Prøv igjen." },
      { status: 502 },
    );
  }
}
