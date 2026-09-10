import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { summarizeCart, upsertAbandonedCart, isEmail } from "@/lib/abandoned";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public capture endpoint. The checkout form calls this when a shopper enters a
 * valid email at /kasse. It's tied to a live PaymentIntent so it can't be abused
 * to inject arbitrary addresses into the reminder queue — a missing, settled or
 * unknown intent is silently ignored. Always returns 200 so it never surfaces
 * an error into the checkout UI.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const email = body?.email;
  const paymentIntentId =
    typeof body?.paymentIntentId === "string" ? body.paymentIntentId : "";
  if (!isEmail(email) || !paymentIntentId) {
    return NextResponse.json({ ok: false });
  }

  // The email must belong to someone actually at our checkout with an open PI.
  try {
      const pi = await (await getStripe()).paymentIntents.retrieve(paymentIntentId);
    if (pi.status === "succeeded" || pi.status === "canceled") {
      return NextResponse.json({ ok: false });
    }
  } catch {
    return NextResponse.json({ ok: false });
  }

  const { items, subtotal } = summarizeCart(body?.items, body?.bump ?? null);
  if (items.length === 0) return NextResponse.json({ ok: false });

  const ok = await upsertAbandonedCart({
    email,
    items,
    subtotal,
    consent: body?.consent === true,
  });
  return NextResponse.json({ ok });
}
