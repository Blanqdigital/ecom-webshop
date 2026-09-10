import { getProduct } from "./products";

// =============================================================================
// SAMPLE OFFER — replace when spinning up a new store (see docs/SETUP.md).
// slug must match a product in src/lib/products.ts.
// =============================================================================

// Pre-purchase order bump: one extra unit of the product at a discount, added
// to the SAME single payment (works for both card and Vipps). The discount is
// applied on the SERVER when pricing the cart, so it can't be tampered with.
export const ORDER_BUMP = {
  slug: "baereslyngen",
  discountPct: 30,
  title: "Legg til en ekstra enhet",
  blurb: "Perfekt som gave eller ekstra i bilen — spar 30 % nå.",
} as const;

/** Discounted unit price in whole kroner, e.g. 590 → 413. */
export function bumpUnitPriceNok(): number {
  const p = getProduct(ORDER_BUMP.slug);
  if (!p) return 0;
  return Math.round(p.priceNok * (1 - ORDER_BUMP.discountPct / 100));
}

/** Original (pre-discount) unit price, for strikethrough display. */
export function bumpCompareAtNok(): number {
  return getProduct(ORDER_BUMP.slug)?.priceNok ?? 0;
}
