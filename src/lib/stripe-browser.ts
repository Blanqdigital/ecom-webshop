"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Browser Stripe.js loader (publishable key). Used by the custom checkout page
// to mount the Payment Element. The publishable key is safe to expose.
// Cache is keyed by publishable key so Admin → Integrations changes take effect
// without a hard reload of a stale singleton.
const _promises = new Map<string, Promise<Stripe | null>>();

export function getStripeBrowser(
  publishableKey?: string | null,
): Promise<Stripe | null> {
  const pk =
    publishableKey?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    "";
  if (!pk) return Promise.resolve(null);
  let p = _promises.get(pk);
  if (!p) {
    p = loadStripe(pk);
    _promises.set(pk, p);
  }
  return p;
}
