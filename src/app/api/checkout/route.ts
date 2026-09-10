import { COMMERCE } from "@/lib/commerce";
import { getSupabaseAdmin as orderDatabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { priceCart, PricingError } from "@/lib/pricing";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

interface ReqItem {
  slug: string;
  colorId: string;
  qty: number;
  free?: boolean;
}

export async function POST(req: Request) {
  if (!COMMERCE.checkoutEnabled || !orderDatabase()) return NextResponse.json({ error: "Butikken er ikke åpen for bestilling ennå." }, { status: 503 });
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
  const items: ReqItem[] = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "Handlekurven er tom." }, { status: 400 });
  }

  let priced;
  try { priced = priceCart(items); }
  catch (error) {
    return NextResponse.json({ error: error instanceof PricingError ? error.message : "Ugyldig handlekurv." }, { status: 400 });
  }
  const cart = JSON.stringify(priced.cartMeta);
  if (cart.length > 480) return NextResponse.json({ error: "For mange varianter i handlekurven." }, { status: 400 });
  // The hosted checkout uses the same authoritative total as Stripe Elements and Vipps.
  const lineItems = [{ price_data: { currency: "nok", unit_amount: priced.amountOre,
    product_data: { name: `${SITE.name} bestilling` } }, quantity: 1 }];

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    new URL(req.url).origin;

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      currency: "nok",
      locale: "nb",
      billing_address_collection: "auto",
      shipping_address_collection: { allowed_countries: ["NO"] },
      phone_number_collection: { enabled: true },
      success_url: `${origin}/takk?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?avbrutt=1`,
      metadata: {
        cart,
      },
    });
  } catch (err) {
    console.error("[checkout] Stripe session create failed:", err);
    return NextResponse.json(
      { error: "Kunne ikke starte betaling. Prøv igjen senere." },
      { status: 502 },
    );
  }

  return NextResponse.json({ url: session.url });
}
