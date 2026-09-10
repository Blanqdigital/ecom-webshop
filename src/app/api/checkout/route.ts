import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getProduct } from "@/lib/products";

export const dynamic = "force-dynamic";

interface ReqItem {
  slug: string;
  colorId: string;
  qty: number;
  free?: boolean;
}

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
  const items: ReqItem[] = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "Handlekurven er tom." }, { status: 400 });
  }

  // Meta Conversions API context, forwarded from the client and stored on the
  // session so the Stripe webhook can send a matching server-side Purchase.
  const str = (v: unknown) =>
    typeof v === "string" ? v.slice(0, 200) : undefined;
  const capiMeta: Record<string, string> = {};
  const fbp = str(body?.fbp);
  const fbc = str(body?.fbc);
  if (fbp) capiMeta.fbp = fbp;
  if (fbc) capiMeta.fbc = fbc;

  // Build line items from the SERVER catalogue; prices are never trusted from
  // the client.
  const lineItems: {
    price_data: {
      currency: string;
      unit_amount: number;
      product_data: { name: string; metadata: Record<string, string> };
    };
    quantity: number;
  }[] = [];

  // BOGO integrity: a free unit is only honoured if backed by a paid unit.
  // Cap total free units at the number of paid units so the offer can't be
  // abused by sending free-only carts.
  const clampQty = (q: number) =>
    Math.max(1, Math.min(99, Math.floor(Number(q) || 0)));
  let freeAllowance = items
    .filter((it) => !it.free)
    .reduce((sum, it) => sum + clampQty(it.qty), 0);

  for (const it of items) {
    const product = getProduct(it.slug);
    const color = product?.colors.find((c) => c.id === it.colorId);
    const qty = clampQty(it.qty);
    if (!product || !color) {
      return NextResponse.json(
        { error: "Et produkt i handlekurven finnes ikke." },
        { status: 400 },
      );
    }

    if (it.free) {
      const granted = Math.min(qty, freeAllowance);
      freeAllowance -= granted;
      if (granted > 0) {
        lineItems.push({
          price_data: {
            currency: "nok",
            unit_amount: 0,
            product_data: {
              name: `${product.name} · ${color.name} (gratis)`,
              metadata: { slug: product.slug, colorId: color.id, free: "1" },
            },
          },
          quantity: granted,
        });
      }
      // Any free units beyond the allowance fall through as paid units.
      const remainder = qty - granted;
      if (remainder > 0) {
        lineItems.push({
          price_data: {
            currency: "nok",
            unit_amount: product.priceNok * 100,
            product_data: {
              name: `${product.name} · ${color.name}`,
              metadata: { slug: product.slug, colorId: color.id },
            },
          },
          quantity: remainder,
        });
      }
      continue;
    }

    lineItems.push({
      price_data: {
        currency: "nok",
        unit_amount: product.priceNok * 100,
        product_data: {
          name: `${product.name} · ${color.name}`,
          metadata: { slug: product.slug, colorId: color.id },
        },
      },
      quantity: qty,
    });
  }

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
        cart: JSON.stringify(
          items.map((i) => ({ slug: i.slug, colorId: i.colorId, qty: i.qty })),
        ).slice(0, 480),
        ...capiMeta,
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
