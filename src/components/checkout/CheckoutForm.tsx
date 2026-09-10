"use client";

import { useEffect, useRef, useState } from "react";
import {
  PaymentElement,
  AddressElement,
  LinkAuthenticationElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useCart } from "@/components/cart/CartProvider";
import { fmtKr } from "@/lib/format";
import { bumpUnitPriceNok } from "@/lib/offers";

/**
 * The Payment Element form: contact (email), shipping address (Norway) and
 * card/payment. On submit it confirms the PaymentIntent and Stripe redirects to
 * /takk. The shipping address from the Address Element is attached to the
 * intent automatically, so the webhook receives the full delivery details.
 *
 * If an order bump is selected, the PaymentIntent's amount is updated on the
 * server first (keeping the same Element), so the charge matches the total.
 */
export function CheckoutForm({
  paymentIntentId,
  bump,
  coupon,
}: {
  paymentIntentId: string | null;
  bump: { colorId: string } | null;
  coupon: { code: string; percentOff: number } | null;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const cart = useCart();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preDiscount = cart.subtotal + (bump ? bumpUnitPriceNok() : 0);
  const total = coupon
    ? Math.max(
        0,
        preDiscount - Math.round((preDiscount * coupon.percentOff) / 100),
      )
    : preDiscount;

  // Abandoned-checkout capture: once a valid email is entered, save it with the
  // cart so a reminder can go out if payment isn't completed. Debounced, and
  // de-duped so we only POST when the email/cart/bump actually changes. The
  // /api/cart/track endpoint verifies the PaymentIntent before storing anything.
  const capturedRef = useRef("");
  useEffect(() => {
    const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    if (!valid || !paymentIntentId || cart.items.length === 0) return;

    const items = cart.items.map((i) => ({
      slug: i.slug,
      colorId: i.colorId,
      qty: i.qty,
      free: i.free,
    }));
    const sig = JSON.stringify({ email, items, bump });
    if (sig === capturedRef.current) return;

    const t = setTimeout(() => {
      capturedRef.current = sig;
      // Consent flag kept for the DB schema; the cookie banner was removed, so
      // reminder eligibility is on for everyone (unsubscribe link handles opt-out).
      void fetch("/api/cart/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          paymentIntentId,
          items,
          bump,
          consent: true,
        }),
        keepalive: true,
      }).catch(() => {
        /* capture must never disturb the checkout */
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [email, paymentIntentId, cart.items, bump]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);

    // Sync the charged amount with the bump/coupon selection before confirming.
    if ((bump || coupon) && paymentIntentId) {
      try {
        const res = await fetch("/api/payment-intent/update", {
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
            bump,
            coupon: coupon?.code ?? null,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Kunne ikke oppdatere beløp.");
        }
      } catch (err) {
        setError((err as Error).message);
        setBusy(false);
        return;
      }
    }

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/takk`,
        receipt_email: email || undefined,
      },
    });

    // On success the browser is redirected to return_url; we only get here on
    // error (validation, declined card, etc.).
    if (error) {
      setError(error.message ?? "Betalingen gikk ikke gjennom. Prøv igjen.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Section title="Kontakt">
        <LinkAuthenticationElement onChange={(e) => setEmail(e.value.email)} />
      </Section>

      <Section title="Leveringsadresse" divided>
        <AddressElement
          options={{
            mode: "shipping",
            allowedCountries: ["NO"],
            fields: { phone: "always" },
          }}
        />
      </Section>

      <Section title="Betaling" divided>
        <PaymentElement options={{ layout: "tabs" }} />
      </Section>

      {error && (
        <p className="mt-5 text-[13.5px] text-red-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!stripe || busy}
        className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-[17px] text-[15.5px] font-semibold text-cream transition-colors hover:bg-clay disabled:opacity-60"
      >
        {busy ? "Behandler betaling …" : `Betal nå · ${fmtKr(total)}`}
      </button>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-faint">
        <Trust icon={<LockIcon />}>Kryptert betaling</Trust>
        <Trust icon={<TruckIcon />}>Fri frakt</Trust>
        <Trust icon={<ReturnIcon />}>Se butikkens returvilkår</Trust>
      </div>
    </form>
  );
}

function Section({
  title,
  divided,
  children,
}: {
  title: string;
  divided?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={divided ? "mt-7 border-t border-line pt-7" : ""}>
      <h2 className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Trust({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {children}
    </span>
  );
}

const ICON = "h-3.5 w-3.5";
function LockIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function TruckIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h11v9H3zM14 9h4l3 3v3h-7" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </svg>
  );
}
function ReturnIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4" />
    </svg>
  );
}
