import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { recordOrder } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.replace(/[^\x21-\x7e]/g, "");
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = (await getStripe()).webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Signature verification failed: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    await recordOrder({
      id: s.id,
      email: s.customer_details?.email ?? null,
      name: s.customer_details?.name ?? null,
      phone: s.customer_details?.phone ?? null,
      amountTotal: s.amount_total != null ? s.amount_total / 100 : null,
      currency: (s.currency ?? "nok").toUpperCase(),
      paymentStatus: s.payment_status ?? null,
      address: s.customer_details?.address ?? null,
      cart: s.metadata?.cart,
      method: "card",
      fbp: s.metadata?.fbp ?? null,
      fbc: s.metadata?.fbc ?? null,
    });
  } else if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    await recordOrder({
      id: pi.id,
      email: pi.receipt_email ?? null,
      name: pi.shipping?.name ?? null,
      phone: pi.shipping?.phone ?? null,
      amountTotal: pi.amount != null ? pi.amount / 100 : null,
      currency: (pi.currency ?? "nok").toUpperCase(),
      paymentStatus: pi.status === "succeeded" ? "paid" : pi.status,
      address: pi.shipping?.address ?? null,
      cart: pi.metadata?.cart,
      method: "card",
      fbp: pi.metadata?.fbp ?? null,
      fbc: pi.metadata?.fbc ?? null,
    });
  }

  return NextResponse.json({ received: true });
}
