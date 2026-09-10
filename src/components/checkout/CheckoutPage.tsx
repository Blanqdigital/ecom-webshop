"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Elements } from "@stripe/react-stripe-js";
import type { Stripe, StripeElementsOptions } from "@stripe/stripe-js";
import { getStripeBrowser } from "@/lib/stripe-browser";
import { useCart } from "@/components/cart/CartProvider";
import { track } from "@/lib/track";
import { logFunnel } from "@/lib/analytics";
import { getProduct } from "@/lib/products";
import { ORDER_BUMP } from "@/lib/offers";
import { CheckoutForm } from "./CheckoutForm";
import { FreeOrderForm } from "./FreeOrderForm";
import { OrderSummary } from "./OrderSummary";
import { VippsButton } from "./VippsButton";

export interface AppliedCoupon {
  code: string;
  percentOff: number;
}

// Load the brand font INTO the Stripe iframe so inputs match the site (the
// iframe can't see the page's --font-grotesk CSS variable).
const fonts: StripeElementsOptions["fonts"] = [
  {
    cssSrc:
      "https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700&display=swap",
  },
];

const appearance: StripeElementsOptions["appearance"] = {
  theme: "stripe",
  variables: {
    colorPrimary: "#1c1c1a",
    colorText: "#1c1c1a",
    colorTextSecondary: "#6b6b66",
    colorDanger: "#b4231b",
    colorBackground: "#ffffff",
    fontFamily: '"Schibsted Grotesk", system-ui, sans-serif',
    fontSizeBase: "15px",
    borderRadius: "12px",
    spacingUnit: "4px",
  },
  rules: {
    ".Label": {
      fontSize: "13px",
      fontWeight: "500",
      color: "#6b6b66",
      marginBottom: "6px",
    },
    ".Input": {
      padding: "13px 14px",
      borderColor: "#e3e3df",
      boxShadow: "none",
    },
    ".Input:focus": {
      borderColor: "#1c1c1a",
      boxShadow: "0 0 0 1px #1c1c1a",
    },
    ".Tab, .Block": { borderColor: "#e3e3df", boxShadow: "none" },
    ".Tab:hover": { borderColor: "#bdbdb6" },
    ".Tab--selected": { borderColor: "#1c1c1a", boxShadow: "0 0 0 1px #1c1c1a" },
  },
};

interface PaymentRuntime {
  vippsEnabled: boolean;
  stripePublishableKey: string;
}

export function CheckoutPage() {
  const cart = useCart();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bump, setBump] = useState<{ on: boolean; colorId: string }>({
    on: false,
    colorId: "",
  });
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<PaymentRuntime | null>(null);
  const [stripePromise, setStripePromise] =
    useState<Promise<Stripe | null> | null>(null);
  const startedRef = useRef(false);

  // A 100% coupon makes the total 0 — Stripe/Vipps can't charge that, so the
  // payment UI is swapped for the free-order form.
  const freeOrder = !!coupon && coupon.percentOff >= 100;

  // Public payment flags from Admin → Integrations (env still wins server-side).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/site-config")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const pk =
          typeof data.stripePublishableKey === "string"
            ? data.stripePublishableKey
            : "";
        setRuntime({
          vippsEnabled: data.vippsEnabled === true,
          stripePublishableKey: pk,
        });
        setStripePromise(getStripeBrowser(pk || null));
      })
      .catch(() => {
        if (cancelled) return;
        // Fall back to build-time env via getStripeBrowser().
        setRuntime({
          vippsEnabled: process.env.NEXT_PUBLIC_VIPPS_ENABLED === "1",
          stripePublishableKey:
            process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
        });
        setStripePromise(getStripeBrowser());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Validate a code server-side, then sync the pending PaymentIntent. */
  async function applyCoupon(code: string) {
    setCouponBusy(true);
    setCouponError(null);
    try {
      const res = await fetch("/api/coupon/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setCouponError(data.error || "Ugyldig rabattkode.");
        return;
      }
      const applied = { code: data.code, percentOff: data.percentOff };
      setCoupon(applied);
      await syncIntent(applied);
    } catch {
      setCouponError("Noe gikk galt. Prøv igjen.");
    } finally {
      setCouponBusy(false);
    }
  }

  async function removeCoupon() {
    setCoupon(null);
    setCouponError(null);
    await syncIntent(null);
  }

  /** Re-price the pending PaymentIntent after a coupon change (best-effort). */
  async function syncIntent(next: AppliedCoupon | null) {
    if (!paymentIntentId || (next && next.percentOff >= 100)) return;
    try {
      await fetch("/api/payment-intent/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          paymentIntentId,
          items: cart.items.map((i) => ({
            slug: i.slug,
            colorId: i.colorId,
            qty: i.qty,
            free: i.free,
          })),
          bump: bump.on ? { colorId: bumpColorId } : null,
          coupon: next?.code ?? null,
        }),
      });
    } catch {
      /* the confirm-time update in CheckoutForm is the safety net */
    }
  }

  // Effective bump colour: explicit pick → first cart colour → first catalogue
  // colour. The bump is added at confirm time (card) / click time (Vipps), so
  // it never needs to be baked into the initial PaymentIntent.
  const bumpColorId =
    bump.colorId ||
    cart.items[0]?.colorId ||
    getProduct(ORDER_BUMP.slug)?.colors[0]?.id ||
    "";
  const bumpPayload = bump.on ? { colorId: bumpColorId } : null;

  // Create the PaymentIntent once, from the cart present when the page loads.
  useEffect(() => {
    if (!cart.hydrated || startedRef.current || cart.items.length === 0) return;
    startedRef.current = true;
    let cancelled = false;

    track("InitiateCheckout", {
      content_ids: cart.items.map((i) => i.slug),
      content_type: "product",
      num_items: cart.count,
      value: cart.subtotal,
      currency: "NOK",
    });
    // First-party funnel (admin chart) — the card flow was missing this, so the
    // admin funnel undercounted checkout vs the Vipps/hosted flows.
    logFunnel("InitiateCheckout", { value: cart.subtotal, currency: "NOK" });

    fetch("/api/payment-intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: cart.items.map((i) => ({
          slug: i.slug,
          colorId: i.colorId,
          qty: i.qty,
          free: i.free,
        })),
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
          setPaymentIntentId(data.paymentIntentId ?? null);
        } else setError(data.error || "Noe gikk galt. Prøv igjen.");
      })
      .catch(() => {
        if (!cancelled) setError("Noe gikk galt. Prøv igjen.");
      });

    return () => {
      cancelled = true;
    };
    // Runs once after hydration (guarded by startedRef); the cart isn't edited
    // on this page, so a snapshot of items/count/subtotal is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.hydrated]);

  const pk = runtime?.stripePublishableKey ?? "";
  const vippsEnabled = runtime?.vippsEnabled === true;

  if (cart.hydrated && cart.items.length === 0) {
    return (
      <main className="mx-auto max-w-[1080px] px-5 pb-24 pt-10 sm:px-7">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-white py-[70px] text-center">
          <p className="text-[16px] text-muted">Handlekurven er tom.</p>
          <Link
            href="/"
            className="rounded-full bg-ink px-8 py-[14px] text-[15px] font-semibold text-cream transition-colors hover:bg-clay"
          >
            Se Bæreslyngen
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1080px] px-5 pb-24 pt-8 sm:px-7 sm:pt-10">
      <h1 className="mb-7 font-serif text-[clamp(28px,4vw,42px)] font-normal">
        Kasse
      </h1>

      <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:gap-10">
        {/* Form (left on desktop, below summary on mobile) */}
        <div className="order-2 lg:order-1 lg:flex-1">
          {vippsEnabled && !freeOrder && (
            <div className="mb-6">
              <VippsButton bump={bumpPayload} coupon={coupon?.code ?? null} />
              <div className="my-6 flex items-center gap-3 text-[12px] uppercase tracking-[0.08em] text-faint">
                <span className="h-px flex-1 bg-line" />
                eller betal med kort
                <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-line bg-white p-5 sm:p-7">
            {freeOrder ? (
              <FreeOrderForm bump={bumpPayload} coupon={coupon!.code} />
            ) : runtime && !pk ? (
              <p className="text-[15px] text-muted">
                Betaling er ikke konfigurert ennå.
              </p>
            ) : error ? (
              <p className="text-[14px] text-red-700">{error}</p>
            ) : clientSecret && stripePromise ? (
              <Elements
                stripe={stripePromise}
                options={{ clientSecret, locale: "nb", appearance, fonts }}
              >
                <CheckoutForm
                  paymentIntentId={paymentIntentId}
                  bump={bumpPayload}
                  coupon={coupon}
                />
              </Elements>
            ) : (
              <div className="space-y-4 py-2">
                <div className="h-11 w-full animate-pulse rounded-xl bg-linen" />
                <div className="h-11 w-full animate-pulse rounded-xl bg-linen" />
                <div className="h-11 w-2/3 animate-pulse rounded-xl bg-linen" />
              </div>
            )}
          </div>
        </div>

        {/* Summary (right on desktop, on top on mobile; sticky while scrolling) */}
        <aside className="order-1 w-full lg:order-2 lg:w-[380px] lg:shrink-0 lg:sticky lg:top-6">
          <OrderSummary
            bumpOn={bump.on}
            bumpColorId={bumpColorId}
            onBumpToggle={(on) => setBump((b) => ({ ...b, on }))}
            onBumpColorChange={(colorId) => setBump((b) => ({ ...b, colorId }))}
            coupon={coupon}
            couponBusy={couponBusy}
            couponError={couponError}
            onApplyCoupon={applyCoupon}
            onRemoveCoupon={removeCoupon}
          />
        </aside>
      </div>
    </main>
  );
}
