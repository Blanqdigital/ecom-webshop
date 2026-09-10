import Link from "next/link";
import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { finalizeVippsPayment } from "@/lib/vipps";
import { PRODUCTS } from "@/lib/products";
import { PurchaseTracker } from "@/components/store/PurchaseTracker";
import { COMPANY } from "@/lib/company";
import { orderStatusUrl, orderTokensConfigured } from "@/lib/order-token";
import { getPostPurchaseOffer } from "@/lib/post-purchase";

export const metadata = {
  title: "Takk for bestillingen",
  robots: { index: false, follow: true },
};

interface Purchase {
  orderId: string;
  value: number;
  currency: string;
  contentIds: string[];
}

function slugsFrom(cartMeta?: string): string[] {
  try {
    const cart = JSON.parse(cartMeta ?? "[]") as { slug?: string }[];
    const ids = [...new Set(cart.map((i) => i.slug).filter(Boolean))] as string[];
    return ids.length ? ids : PRODUCTS[0]?.slug ? [PRODUCTS[0].slug] : [];
  } catch {
    return PRODUCTS[0]?.slug ? [PRODUCTS[0].slug] : [];
  }
}

async function getPurchase(args: {
  sessionId?: string;
  paymentIntent?: string;
  vipps?: string;
  free?: string;
}): Promise<Purchase | null> {
  if (args.free) {
    try {
      const supabase = getSupabaseAdmin();
      if (!supabase) return null;
      const { data } = await supabase
        .from("orders")
        .select("stripe_session_id,amount_total,currency,items")
        .eq("stripe_session_id", args.free)
        .maybeSingle();
      if (!data) return null;
      return {
        orderId: data.stripe_session_id,
        value: Number(data.amount_total) || 0,
        currency: (data.currency ?? "NOK").toUpperCase(),
        contentIds: slugsFrom(
          Array.isArray(data.items) ? JSON.stringify(data.items) : undefined,
        ),
      };
    } catch {
      return null;
    }
  }
  if (args.vipps) {
    try {
      const r = await finalizeVippsPayment(args.vipps);
      if (r.recorded && r.amountOre > 0) {
        return {
          orderId: args.vipps,
          value: r.amountOre / 100,
          currency: r.currency,
          contentIds: slugsFrom(r.cartRaw),
        };
      }
    } catch {
      /* fall through */
    }
    return null;
  }

  if (!args.sessionId && !args.paymentIntent) return null;
  try {
    const stripe = await getStripe();

    if (args.paymentIntent) {
      const pi = await stripe.paymentIntents.retrieve(args.paymentIntent);
      if (!pi || pi.amount == null) return null;
      return {
        orderId: pi.id,
        value: pi.amount / 100,
        currency: (pi.currency ?? "nok").toUpperCase(),
        contentIds: slugsFrom(pi.metadata?.cart),
      };
    }

    const session = await stripe.checkout.sessions.retrieve(args.sessionId!);
    if (!session || session.amount_total == null) return null;
    return {
      orderId: session.id,
      value: session.amount_total / 100,
      currency: (session.currency ?? "nok").toUpperCase(),
      contentIds: slugsFrom(session.metadata?.cart),
    };
  } catch {
    return null;
  }
}

export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{
    session_id?: string;
    payment_intent?: string;
    vipps?: string;
    free?: string;
    skip_offer?: string;
  }>;
}) {
  const { session_id, payment_intent, vipps, free, skip_offer } = await searchParams;

  // Card Payment Element: show post-purchase offer when configured.
  if (payment_intent && !skip_offer && !vipps && !free) {
    const offer = await getPostPurchaseOffer(payment_intent);
    if (offer) {
      redirect(`/tilbud?payment_intent=${encodeURIComponent(payment_intent)}`);
    }
  }

  const purchase = await getPurchase({
    sessionId: session_id,
    paymentIntent: payment_intent,
    vipps,
    free,
  });

  const statusUrl =
    purchase && (await orderTokensConfigured())
      ? await orderStatusUrl(purchase.orderId, COMPANY.url)
      : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-6 text-center">
      {purchase && (
        <PurchaseTracker
          orderId={purchase.orderId}
          value={purchase.value}
          currency={purchase.currency}
          contentIds={purchase.contentIds}
        />
      )}
      <div className="mb-5 font-serif text-[34px] tracking-[0.04em]">{COMPANY.brand}</div>
      <div className="mb-3 text-[12px] uppercase tracking-[0.16em] text-clay">
        Bestilling bekreftet
      </div>
      <h1 className="mb-4 max-w-[16ch] font-serif text-[clamp(30px,5vw,46px)] font-normal leading-[1.08]">
        Takk for bestillingen
      </h1>
      <p className="mb-8 max-w-[44ch] text-[16px] leading-[1.6] text-muted-2">
        Vi har mottatt bestillingen din og sender deg en bekreftelse på e-post.
        Pakken er på vei innen 7–10 dager.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {statusUrl && (
          <Link
            href={statusUrl}
            className="rounded-full border border-ink px-9 py-[15px] text-[15px] font-semibold text-ink transition-colors hover:bg-white"
          >
            Følg bestillingen
          </Link>
        )}
        <Link
          href="/"
          className="rounded-full bg-ink px-9 py-[15px] text-[15px] font-semibold text-cream transition-colors hover:bg-clay"
        >
          Tilbake til butikken
        </Link>
      </div>
    </div>
  );
}
