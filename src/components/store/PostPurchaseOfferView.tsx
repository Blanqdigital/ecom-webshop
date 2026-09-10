import { redirect } from "next/navigation";
import { PurchaseTracker } from "@/components/store/PurchaseTracker";
import { PostPurchaseUpsell } from "@/components/store/PostPurchaseUpsell";
import { COMPANY } from "@/lib/company";
import { PRODUCTS } from "@/lib/products";
import { getPostPurchaseOffer } from "@/lib/post-purchase";
import { getStripe } from "@/lib/stripe";

async function getPurchaseValue(paymentIntent?: string) {
  if (!paymentIntent) return null;
  try {
    const pi = await (await getStripe()).paymentIntents.retrieve(paymentIntent);
    if (!pi || pi.amount == null) return null;
    let contentIds = PRODUCTS[0]?.slug ? [PRODUCTS[0].slug] : [];
    try {
      const cart = JSON.parse(pi.metadata?.cart ?? "[]") as { slug?: string }[];
      const ids = [...new Set(cart.map((i) => i.slug).filter(Boolean))] as string[];
      if (ids.length) contentIds = ids;
    } catch { /* keep default */ }
    return {
      orderId: pi.id,
      value: pi.amount / 100,
      currency: (pi.currency ?? "nok").toUpperCase(),
      contentIds,
    };
  } catch {
    return null;
  }
}

export async function PostPurchaseOfferView({
  paymentIntent,
}: {
  paymentIntent?: string;
}) {
  const [purchase, offer] = await Promise.all([
    getPurchaseValue(paymentIntent),
    getPostPurchaseOffer(paymentIntent),
  ]);
  const params = new URLSearchParams();
  if (paymentIntent) params.set("payment_intent", paymentIntent);
  const query = params.toString();
  const confirmationHref = `/takk${query ? `?${query}` : ""}`;

  if (!purchase || !offer) redirect(confirmationHref);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-cream text-ink">
      <PurchaseTracker
        orderId={purchase.orderId}
        value={purchase.value}
        currency={purchase.currency}
        contentIds={purchase.contentIds}
      />
      <header className="border-b border-line px-5 py-5 sm:px-8">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
          <div className="font-serif text-[27px] tracking-[0.04em]">{COMPANY.brand}</div>
          <div className="flex items-center gap-2 text-[13px] font-medium text-muted-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-clay text-[12px] text-white">✓</span>
            <span>Bestilling bekreftet</span>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <PostPurchaseUpsell {...offer} continueHref={confirmationHref} />
      </main>
    </div>
  );
}
